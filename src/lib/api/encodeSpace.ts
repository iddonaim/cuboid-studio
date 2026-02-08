export interface EncodeSpaceRequest {
  imageBase64: string;
  imageMediaType?: string;
}

export interface EncodedCube {
  variationId: string;
  position: [number, number, number];
  rotation: { x: number; y: number };
}

export interface EncodeSpaceResponse {
  reasoning: string;
  cubes: EncodedCube[];
}

export async function encodeSpace(request: EncodeSpaceRequest): Promise<EncodeSpaceResponse> {
  const response = await fetch('/api/encode-space', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      imageBase64: request.imageBase64,
      imageMediaType: request.imageMediaType || 'image/jpeg',
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
    throw new Error(errorData.error || `Encoding failed (${response.status})`);
  }

  return response.json();
}
