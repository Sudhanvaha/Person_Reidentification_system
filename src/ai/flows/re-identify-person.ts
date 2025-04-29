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

const SnapshotSchema = z.object({
  timestamp: z.number().describe('The timestamp (in seconds) of the snapshot in the video.'),
  dataUri: z.string().describe('The data URI of the snapshot image.'),
});

const ReIdentifyPersonOutputSchema = z.object({
  isPresent: z.boolean().describe('Whether the person in the photo is present in the video.'),
  confidence: z.number().optional().describe('The confidence score of the re-identification, if available.'),
  reason: z.string().describe('The reason for the determination.'),
  snapshots: z.array(SnapshotSchema).optional().describe('Snapshots (data URIs) with timestamps where the person is visible in the video, if present.'),
});
export type ReIdentifyPersonOutput = z.infer<typeof ReIdentifyPersonOutputSchema>;

// Dummy tool to simulate finding snapshots in the video.  In a real application, this would use
// a computer vision model to find frames where the person is visible.
const findSnapshotsTool = ai.defineTool({
  name: 'findSnapshots',
  description: 'Finds snapshots in the video where the person in the photo is visible, along with their timestamps.',
  inputSchema: z.object({
    videoDataUri: z.string().describe("A video of a scene, as a data URI that must include a MIME type and use Base64 encoding."),
    numSnapshots: z.number().describe('The number of snapshots to return.'),
    videoDuration: z.number().describe('The duration of the video in seconds.'),
  }),
  outputSchema: z.array(SnapshotSchema).describe('A list of snapshots (data URIs) with timestamps where the person is visible in the video.'),
}, async input => {
  const {videoDataUri, numSnapshots, videoDuration} = input;
  // In a real application, this would use a computer vision model to find frames where the person is visible.
  // For this example, we'll just return some dummy snapshots with dummy timestamps, ensuring they are within videoDuration.
  const snapshots: SnapshotSchema[] = [];
  for (let i = 0; i < numSnapshots; i++) {
    // Generate a dummy timestamp (0 to videoDuration seconds).
    // Ensure timestamp is within videoDuration.
    const timestamp = Math.min(Math.random() * videoDuration, videoDuration);
    snapshots.push({
      timestamp: timestamp,
      dataUri: `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=`,
    });
  }
  return snapshots;
});


const reIdentifyPersonPrompt = ai.definePrompt({
  name: 'reIdentifyPersonPrompt',
  tools: [findSnapshotsTool],
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
      videoDuration: z.number().describe('The duration of the video in seconds.'),
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
  
  The video is {{videoDuration}} seconds long.

  Photo: {{media url=photoDataUri}}
  Video: {{media url=videoDataUri}}

  Respond with whether the person is present in the video, a confidence score if available, and the reason for your determination.

  If the person is present in the video, use the findSnapshots tool to find the timestamps where the person is visible.`,
});

async function getSnapshots(videoDataUri: string, videoDuration: number): Promise<SnapshotSchema[]> {
  try {
    const snapshots = await findSnapshotsTool({videoDataUri, numSnapshots: 3, videoDuration});
    return snapshots;
  } catch (error) {
    console.error('Error finding snapshots:', error);
    return [];
  }
}

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
    // Extract video duration from the video data URI.  This is a dummy value.  A real implementation would need to parse the video data.
    const videoDuration = 5;

    const {output} = await reIdentifyPersonPrompt({...input, videoDuration});

    let snapshots: SnapshotSchema[] | undefined = undefined;
    if (output?.isPresent) {
      snapshots = await getSnapshots(input.videoDataUri, videoDuration);
    }

    return {...output, snapshots};
  }
);

export async function reIdentifyPerson(input: ReIdentifyPersonInput): Promise<ReIdentifyPersonOutput> {
  return reIdentifyPersonFlow(input);
}
