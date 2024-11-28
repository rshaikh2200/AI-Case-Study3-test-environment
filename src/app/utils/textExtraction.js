// src/utils/textExtraction.js

import pdf from 'pdf-parse';
import { read, Document } from 'docx';

export async function extractTextFromPDF(buffer) {
  try {
    const data = await pdf(buffer);
    return data.text;
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    throw new Error("Failed to extract text from PDF.");
  }
}

export async function extractTextFromDOCX(buffer) {
  try {
    const doc = await read(buffer);
    const paragraphs = doc.getParagraphs();
    return paragraphs.map(p => p.text).join('\n');
  } catch (error) {
    console.error("Error extracting text from DOCX:", error);
    throw new Error("Failed to extract text from DOCX.");
  }
}

export function extractTextFromTXT(buffer) {
  try {
    return buffer.toString('utf-8');
  } catch (error) {
    console.error("Error extracting text from TXT:", error);
    throw new Error("Failed to extract text from TXT.");
  }
}
