require('dotenv').config(); // make sure to install the dotenv package

const {Telegraf} = require('telegraf');
const speech = require('@google-cloud/speech');
const openAI = require("openai");
const fs = require('fs');
const axios = require('axios');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const ffmpeg = require('fluent-ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);
// path to your JSON key file
const keyFilename = process.env.TEXT_TO_SPEECH_FILE_PATH;

// Creates a client
const client = new speech.SpeechClient({ keyFilename });

const bot = new Telegraf(process.env.BOT_TOKEN);



  // Helper function to convert voice messages to WAV
async function convertVoiceToWAV(voiceUrl) {
    // Download the file from the voice URL
    return axios({
      url: voiceUrl,
      responseType: 'stream', // Notice the responseType is 'stream'
    }).then(response => {
      // Promise wrapper around the conversion process
      return new Promise((resolve, reject) => {
        // Define the output file name
        const outputFilename = './output.wav';
        // Create a write stream for the output file
        const outputStream = fs.createWriteStream(outputFilename);
        // Set up the ffmpeg command
        ffmpeg(response.data) // Passing the response stream directly to ffmpeg
          .inputFormat('ogg')
          .audioCodec('pcm_s16le') // Linear16 for Google Speech-to-Text
          .audioFrequency(48000)
          .on('error', (err) => {
            // Handle ffmpeg error
            console.error('An error occurred during the conversion process:', err);
            reject(err);
          })
          .on('end', () => {
            // Conversion finished
            console.log('Audio conversion finished.');
            // Read the converted WAV file
            const wavBuffer = fs.readFileSync(outputFilename);
            resolve(wavBuffer);
            // Clean up the WAV file after reading it
            fs.unlinkSync(outputFilename);
          })
          // Direct the output to the write stream
          .pipe(outputStream, { end: true });
      });
    });
}
// Helper function to send an audio message to Google Cloud and get the transcription
async function transcribeAudio(audioBuffer) {
    const audio = {
      content: audioBuffer.toString('base64'),
    };
  
    const config = {
      encoding: 'LINEAR16',
      sampleRateHertz: 48000,
      languageCode: 'en-US',
    };
  
    const request = {
      audio: audio,
      config: config,
    };
  
    const [response] = await googleClient.recognize(request);
    const transcription = response.results
      .map((result) => result.alternatives[0].transcript)
      .join('\n');
    return transcription;
  }
  
  // Helper function to interact with OpenAI
  async function askOpenAI(question) {
    // Use the question with the OpenAI API as before
  }
  
  
  bot.on('voice', async (ctx) => {
    try {
      // Step 1: Get the file ID from the voice message
      const fileId = ctx.message.voice.file_id;
      
      // Step 2: Get the file path from Telegram
      const fileData = await ctx.telegram.getFile(fileId);
      const filePath = fileData.file_path;
      const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;
      console.log(fileUrl);
  
      // Step 3: Download the file and convert it
      const audioBuffer = await convertVoiceToWAV(fileUrl);
      const transcription = await transcribeAudio(audioBuffer);
      console.log(transcription);
      // ... (The rest of your code for OpenAI interaction and responding to the user)
    } catch (error) {
      console.error(error);
      ctx.reply('I encountered an error while processing your message.');
    }
  });
  
  // Start polling
  bot.launch();