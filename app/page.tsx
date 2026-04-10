"use client";

import { useState } from "react";
import CameraCapture from "@/components/CameraCapture";
import FaceAnalyzer from "@/components/FaceAnalyzer";

export default function Home() {
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);

  return (
    <main className="flex flex-col items-center justify-center min-h-screen py-12 px-4">
      {imageDataUrl ? (
        <FaceAnalyzer
          imageDataUrl={imageDataUrl}
          onReset={() => setImageDataUrl(null)}
        />
      ) : (
        <CameraCapture onCapture={setImageDataUrl} />
      )}
    </main>
  );
}
