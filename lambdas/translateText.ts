/* eslint-disable import/extensions, import/no-absolute-path */
import { SQSHandler } from "aws-lambda";
import { Readable } from "stream";
import {
  GetObjectCommand,
  PutObjectCommandInput,
  GetObjectCommandInput,
  S3Client,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { TranslateTextCommand, TranslateClient, TranslateTextCommandInput } from "@aws-sdk/client-translate";

const s3 = new S3Client();
const translate = new TranslateClient();

export const handler: SQSHandler = async (event) => {
  console.log("Event ", event);
  for (const record of event.Records) {
    const recordBody = JSON.parse(record.body);  // Parse SQS message
    const snsMessage = JSON.parse(recordBody.Message); // Parse SNS message

    if (snsMessage.Records) {
      console.log("Record body ", JSON.stringify(snsMessage));
      for (const messageRecord of snsMessage.Records) {
        const s3e = messageRecord.s3;
        const srcBucket = s3e.bucket.name;
        // Object key may have spaces or unicode non-ASCII characters.
        const srcKey = decodeURIComponent(s3e.object.key.replace(/\+/g, " "));

        try {
          // Download the text from the S3 source bucket.
          const params: GetObjectCommandInput = {
            Bucket: srcBucket,
            Key: srcKey,
          };
          const origtext = await s3.send(new GetObjectCommand(params));
          console.log("original text:", origtext)
          //reading in the text content in chunks from the s3 event  -  https://nodejs.org/api/stream.html#stream_readable_streams
          const textContent: string = await new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            (origtext.Body as Readable)?.on('data', (chunk) => chunks.push(chunk));
            (origtext.Body as Readable)?.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
            (origtext.Body as Readable)?.on('error', reject);
          });

          console.log("text content:", textContent)
          //Translate the text
          const translationParams: TranslateTextCommandInput = {
            Text: textContent, 
            SourceLanguageCode: 'auto',
            TargetLanguageCode: 'ga', //irish
          };
          const translationResult = await translate.send(new TranslateTextCommand(translationParams));

          console.log("translation result", translationResult.TranslatedText)

          const uploadParams: PutObjectCommandInput = {
            Bucket: process.env.RESULT_BUCKET,
            Key: `translated_${srcKey}`,
            Body: translationResult.TranslatedText,
          };
          await s3.send(new PutObjectCommand(uploadParams));
          
        } catch (error) {
          console.log(error);
        }
      }
    }
  }

  async function streamToString(stream: Readable): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      stream.on('error', reject);
    });
  }
};