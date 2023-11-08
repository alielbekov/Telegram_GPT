import dotenv from 'dotenv';
dotenv.config();
import { Telegraf } from 'telegraf';
import speech from '@google-cloud/speech';
import fs from 'fs';
import path from "path";
import axios from 'axios';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import OpenAI from 'openai';
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const keyFilename = process.env.TEXT_TO_SPEECH_FILE_PATH; // path to your JSON key file
// Creates a client
const googleClient = new speech.SpeechClient({ keyFilename });
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY, // defaults to process.env["OPENAI_API_KEY"]
  });
  
const conversationContexts = new Map();
const speechFile = path.resolve("./speech.mp3");
var wasAudio = false;


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
async function getOpenAITextResponse(userId, message) {
    // Retrieve the conversation context
    const conversation = conversationContexts.get(userId) || [];
  
    // Add the new message to the conversation history
    conversation.push({ role: 'user', content: message });
  
    // Generate a response using OpenAI API
    const chatCompletion = await openai.chat.completions.create({
      messages: conversation,
      model: 'gpt-4-1106-preview',
    });
    console.log(chatCompletion.usage);
  
    // Get the GPT response and add it to the conversation history
    const gptResponse = chatCompletion.choices[0].message.content;
    // Log the token usage (if available in the headers)

    conversation.push({ role: 'assistant', content: gptResponse });
  
    // Save the updated conversation context
    conversationContexts.set(userId, conversation);
  
    // Return the GPT response
    return gptResponse;
  }

  async function getOpenAIAudioResponse(userId, message) {
    // Retrieve the conversation context
    const conversation = conversationContexts.get(userId) || [];
  
    // Add the new message to the conversation history
    conversation.push({ role: 'user', content: message });
  
    // Generate a response using OpenAI API
    const chatCompletion = await openai.chat.completions.create({
      messages: conversation,
      model: 'gpt-4-1106-preview',
    });
    console.log(chatCompletion.usage);
  
    // Get the GPT response and add it to the conversation history
    const gptResponse = chatCompletion.choices[0].message.content;
    // Log the token usage (if available in the headers)

    const mp3 = await openai.audio.speech.create({
        model: "tts-1",
        voice: "echo",
        input: gptResponse,
      });
    console.log(speechFile);
    const buffer = Buffer.from(await mp3.arrayBuffer());
    await fs.promises.writeFile(speechFile, buffer);


    conversation.push({ role: 'assistant', content: gptResponse });

  
    // Return the GPT response
    return speechFile;
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
      languageCode: 'ru-RU'
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
    wasAudio = true;
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
    
    await ctx.telegram.sendChatAction(ctx.chat.id, 'upload_voice');
    const response = await getOpenAIAudioResponse(ctx.message.from.id, transcription);

    await ctx.telegram.sendVoice(ctx.message.chat.id, { source: speechFile });

    // Cleanup: delete the local files after processing
    fs.unlinkSync(originalPath);
    fs.unlinkSync(outputPath);
    fs.unlinkSync(speechFile); // Make sure to also delete the generated audio file
  } catch (error) {
    console.error(error);
    ctx.reply('I encountered an error while processing your message.');
  }
});

// Function to handle text messages
bot.on('text', async (ctx) => {
    wasAudio = false;
    const userId = ctx.message.from.id;
    const message = ctx.message.text;
    await ctx.telegram.sendChatAction(ctx.chat.id, 'typing');

  
    // Get response from GPT-3
    const response = await getOpenAITextResponse(userId, message);
  
    // Send the response back to the user
    await ctx.reply(response);
  });


// Start polling
bot.launch();
