const fs = require('fs');
const gkm = require('gkm');
const robot = require('robotjs');
const util = require('util');

const OUTPUT_FOLDER= 'output';
const FILE_NAME = 'recording.json';
const RANDOMIZE_OFFSET_MAX = 4;

const State = Object.freeze({
  RECORD: 'RECORD',
  REPLAY: 'REPLAY',
  STANDBY: 'STANDBY',
});

const StateKey = Object.freeze({
  RECORD: 'F1',
  REPLAY: 'F2',
  LOAD: 'F3',
});

const MouseKey = Object.freeze(['left', 'right', 'middle']);

const EventType = Object.freeze({
  KEYBOARD: 'KEYBOARD',
  MOUSE: 'MOUSE',
});

class Event {
  constructor(eventType, key, delay, mousePos = null) {
    this.eventType = eventType;
    this.key = key;
    this.delay = delay;
    this.mousePos = mousePos;
  }
}

function getRandomOffset(){
  const randomOffset = Math.floor(Math.random() * RANDOMIZE_OFFSET_MAX);
  return randomOffset * (Math.floor(Math.random() * 2) == 1 ? 1 : -1); // Randomize positive / negative
}

let state = State.STANDBY;
let recording = [];
let lastInputTime = null;
async function playBack(inputIndex) {
  if (state === State.REPLAY) {
    const input = recording[inputIndex];
    setTimeout(() => {
      if (state === State.STANDBY) {
        return;
      }

      if (input.eventType === EventType.KEYBOARD) {
        try {
          robot.keyTap(input.key.toLowerCase());
          console.log(`Key Tap: ${input.key}`);
        } catch (ex) {
          console.log(`Invalid Key: ${input.key} - Skipping`);
        }
      } else if (input.eventType === EventType.MOUSE) {
        const xPos = input.mousePos.x + getRandomOffset(),
          yPos =  input.mousePos.y + getRandomOffset();

        robot.moveMouseSmooth(xPos, yPos);
        robot.mouseClick(MouseKey[Number(input.key) - 1]);
        console.log(`Click: ${xPos}, ${yPos}`)
      }
      if (inputIndex < recording.length - 1) {
        playBack(++inputIndex);
      } else {
        playBack(0);
      }
    }, input.delay);
  }
}

async function loadRecording() {
  try {
    const readFile = util.promisify(fs.readFile),
      recording = await readFile(`${OUTPUT_FOLDER}/${FILE_NAME}`, { encoding: 'utf8' });

    return JSON.parse(recording);
  } catch (_) {
    console.log(`ERROR - Failed to parse recording file. Ensure that it is valid JSON.`);
    return [];
  }
 }

async function saveRecording(recording) {
 const writeFile = util.promisify(fs.writeFile);
 const error = await writeFile(`${OUTPUT_FOLDER}/${FILE_NAME}`, JSON.stringify(recording));
 if (error) {
   return error;
 }
 console.log(`Recording saved successfully as '${FILE_NAME}'`);
}

gkm.events.on('mouse.pressed', event => {
  if (state === State.RECORD) {
    currentTime = new Date().getTime();
    const mousePos = robot.getMousePos();
    recording.push(new Event(EventType.MOUSE, event, currentTime - lastInputTime, mousePos));
    lastInputTime = currentTime;
    console.log(`Recorded click at (${mousePos.x}, ${mousePos.y})`);
  }
});

gkm.events.on('key.released', async event => {
  // Pressing the same button puts you back in standby
  if (StateKey[state] === event[0]) {
    console.log('Paused');
    state = State.STANDBY;
    return;
  }
  if (event[0] === StateKey.LOAD && state === State.STANDBY) {
    recording = await loadRecording();
    if (Array.isArray(recording) && recording.length > 0) {
      console.log('Successfully loaded recording.');
    }
  }
  if (event[0] === StateKey.RECORD && state === State.STANDBY) {
    state = State.RECORD;
    recording = [];
    lastInputTime = new Date().getTime();
  } else if (event[0] === StateKey.REPLAY) {
    if (!recording.length) {
      console.log('No Recording Available - Press F1 to record some inputs.');
    }
    const error = await saveRecording(recording);
    if (error) {
      console.log(`Error - Failed to save recording: ${error.message}`);
    }

    state = State.REPLAY;
    playBack(0);
  }
});
