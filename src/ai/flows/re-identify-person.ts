// re-identify-person.ts
'use server';
/**
 * @fileOverview A person re-identification AI agent.
 *
 * - reIdentifyPerson - A function that handles the person re-identification process.
 * - ReIdentifyPersonInput - The input type for the reIdentifyPerson function.
 * - ReIdentifyPersonOutput - The return type for the reIdentifyPerson function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const ReIdentifyPersonInputSchema = z.object({
  photoDataUri: z
    .string()
    .describe(
      "A photo of a person, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
  videoDataUri: z
    .string()
    .describe(
      "A video of a scene, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
    ),
});
export type ReIdentifyPersonInput = z.infer<typeof ReIdentifyPersonInputSchema>;

const ReIdentifyPersonOutputSchema = z.object({
  isPresent: z.boolean().describe('Whether the person in the photo is present in the video.'),
  confidence: z.number().optional().describe('The confidence score of the re-identification, if available.'),
  reason: z.string().describe('The reason for the determination.'),
});
export type ReIdentifyPersonOutput = z.infer<typeof ReIdentifyPersonOutputSchema>;

export async function reIdentifyPerson(input: ReIdentifyPersonInput): Promise<ReIdentifyPersonOutput> {
  return reIdentifyPersonFlow(input);
}

const reIdentifyPersonPrompt = ai.definePrompt({
  name: 'reIdentifyPersonPrompt',
  input: {
    schema: z.object({
      photoDataUri: z
        .string()
        .describe(
          "A photo of a person, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
        ),
      videoDataUri: z
        .string()
        .describe(
          "A video of a scene, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."
        ),
    }),
  },
  output: {
    schema: z.object({
      isPresent: z.boolean().describe('Whether the person in the photo is present in the video.'),
      confidence: z.number().optional().describe('The confidence score of the re-identification, if available.'),
      reason: z.string().describe('The reason for the determination.'),
    }),
  },
  prompt: `You are an expert in person re-identification. Given a photo of a person and a video, determine if the person in the photo is present in the video.

  Photo: {{media url=photoDataUri}}
  Video: {{media url=videoDataUri}}

  Respond with whether the person is present in the video, a confidence score if available, and the reason for your determination.`,
});

const reIdentifyPersonFlow = ai.defineFlow<
  typeof ReIdentifyPersonInputSchema,
  typeof ReIdentifyPersonOutputSchema
>(
  {
    name: 'reIdentifyPersonFlow',
    inputSchema: ReIdentifyPersonInputSchema,
    outputSchema: ReIdentifyPersonOutputSchema,
  },
  async input => {
    const {output} = await reIdentifyPersonPrompt(input);
    return output!;
  }
);
