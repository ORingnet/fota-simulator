const fs = require('fs');
const https = require('https');
const md5 = require('md5');
const mqtt = require('mqtt');

const config = {
  clientId: 'test-thing-2',
  username: 'e8236239f8146104de7d',
  password: 'e8236239f8146104de7d',
  version: 'v0.0.2',
};

const firmwareName = 'firmware.bin';
const client = mqtt.connect('mqtt://localhost:1883', config);
const getJobTopic = `$thing/${config.clientId}/$ota/jobs/get`;
const notifyJobTopic = `$thing/${config.clientId}/$ota/jobs/notify`;
const updateOTAJobTopic = (jobId) => `$thing/${config.clientId}/$ota/jobs/${jobId}/update`;

function subscribeOTAJob() {
  client.subscribe(notifyJobTopic);
}

function requestOTAJob() {
  const payload = { version: config.version };
  client.publish(getJobTopic, JSON.stringify(payload));
}

function updateOTAJobStatus(jobId, status, reason) {
  console.log(`Update OTA Job status ${jobId} to ${status}`)
  const payload = { status, reason };
  client.publish(updateOTAJobTopic(jobId), JSON.stringify(payload));
}

function downloadFirmware(url) {
  return new Promise((resolve) => {
    console.log('Start to download firmware');
    const file = fs.createWriteStream(firmwareName);
    https.get(url, (res) => {
      res.pipe(file);
    });

    file.on('finish', () => {
      file.close();
      console.log('Download file finished');
      resolve();
    });
  })
}

function checksum(checksum) {
  const buffer = fs.readFileSync(firmwareName);
  const md5Checksum = md5(buffer);

  return md5Checksum === checksum;
}

async function handleOTAJob(job) {
  if (job.message === 'No job') {
    console.log('No job to run');
    return;
  }

  console.log('Receive OTA Job:::', job);
  updateOTAJobStatus(job.jobId, 'running');
  await downloadFirmware(job.downloadUrl);
  const isValidChecksum = checksum(job.checksum);

  if (isValidChecksum) {
    console.log('Checksum is valid');
    console.log(`Flush firmware ${config.version} and update to ${job.version}`);
    updateOTAJobStatus(job.jobId, 'success');
    console.log('OTA job finished');
    config.version = job.version;
  } else {
    console.log('Checksum is invalid');
    updateOTAJobStatus(job.jobId, 'failure', 'Invalid checksum');
  }
}

client.on('connect', () => {
  console.log('connected!');
  subscribeOTAJob();
  requestOTAJob();

  setInterval(() => {
    requestOTAJob();
  }, 10000);
});

client.on('message', (topic, payload) => {
  switch (topic) {
    case notifyJobTopic:
      handleOTAJob(JSON.parse(payload.toString()));
      break;
    default:
      break;
  }
});

client.on('error', (err) => {
  console.error('client error: ', err);
});

