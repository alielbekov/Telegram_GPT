require('dotenv').config();
const { Telegraf } = require('telegraf');
const speech = require('@google-cloud/speech');
const fs = require('fs');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

require('dotenv').config(); // make sure to install the dotenv package

const keyFilename = process.env.TEXT_TO_SPEECH_FILE_PATH; // path to your JSON key file

// Creates a client
const googleClient = new speech.SpeechClient({ keyFilename });

const bot = new Telegraf(process.env.BOT_TOKEN);

// Helper function to download the voice message and convert it to WAV
async function downloadAndConvertVoiceToWAV(fileUrl, originalPath, outputPath) {
  const writer = fs.createWriteStream(originalPath);
  const response = await axios({
    url: fileUrl,
    responseType: 'stream',
  });

  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', () => {
      ffmpeg(originalPath)
        .outputFormat('wav')
        .audioCodec('pcm_s16le')
        .audioFrequency(48000) // Set the correct frequency for speech recognition
        .on('end', () => {
          console.log('Finished converting to WAV');
          resolve(outputPath);
        })
        .on('error', (err) => {
          console.error('An error occurred during the conversion:', err);
          reject(err);
        })
        .save(outputPath); // Save as WAV file
    });
    writer.on('error', reject);
  });
}

// Helper function to perform speech-to-text transcription
async function transcribeAudio(filePath) {
    const file = fs.readFileSync(filePath);
    const audioBytes = file.toString('base64');
  
    const audio = {
      content: audioBytes,
    };
  
    const config = {
      encoding: 'LINEAR16',
      sampleRateHertz: 48000, // The sample rate in Hertz
      languageCode: 'en-US', // The language of the supplied audio
    };
  
    const request = {
      audio: audio,
      config: config,
    };
  
    // Detects speech in the audio file
    const [response] = await googleClient.recognize(request);
    const transcription = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');
  
    return transcription;
  }


// Update the bot.on('voice', ...) event handler
bot.on('voice', async (ctx) => {
  try {
    const fileId = ctx.message.voice.file_id;
    const fileData = await ctx.telegram.getFile(fileId);
    const filePath = fileData.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${filePath}`;
    const originalPath = 'voice.oga'; // Telegram voice messages are in .oga format
    const outputPath = 'voice.wav'; // The path where the WAV file should be saved

    // Call the helper function to download and convert the voice message
    await downloadAndConvertVoiceToWAV(fileUrl, originalPath, outputPath);

    // Transcribe the audio file to text
    const transcription = await transcribeAudio(outputPath);
    console.log('Transcription: ', transcription);

    // Send the transcription back to the user
    await ctx.reply(`Transcription: ${transcription}`);

    // Cleanup: delete the local files after processing
    fs.unlinkSync(originalPath);
    fs.unlinkSync(outputPath);

  } catch (error) {
    console.error(error);
    ctx.reply('I encountered an error while processing your message.');
  }
});


// Start polling
bot.launch();
