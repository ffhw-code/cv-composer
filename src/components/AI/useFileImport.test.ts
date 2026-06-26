import { describe, it, expect } from 'vitest';
import { isSupportedUploadFile } from './useFileImport';

describe('isSupportedUploadFile', () => {
  it('accepts PNG images', () => {
    const file = new File([''], 'resume.png', { type: 'image/png' });
    expect(isSupportedUploadFile(file)).toBe(true);
  });

  it('accepts JPEG images', () => {
    const file = new File([''], 'photo.jpg', { type: 'image/jpeg' });
    expect(isSupportedUploadFile(file)).toBe(true);
  });

  it('accepts text files by MIME type', () => {
    const file = new File([''], 'resume.txt', { type: 'text/plain' });
    expect(isSupportedUploadFile(file)).toBe(true);
  });

  it('accepts text files by extension (no MIME)', () => {
    const file = new File([''], 'resume.txt', { type: '' });
    expect(isSupportedUploadFile(file)).toBe(true);
  });

  it('accepts PNG by extension with unknown MIME', () => {
    const file = new File([''], 'resume.png', { type: 'application/octet-stream' });
    expect(isSupportedUploadFile(file)).toBe(true);
  });

  it('accepts JPG by extension with unknown MIME', () => {
    const file = new File([''], 'resume.jpg', { type: 'application/octet-stream' });
    expect(isSupportedUploadFile(file)).toBe(true);
  });

  it('accepts JPEG by extension', () => {
    const file = new File([''], 'resume.jpeg', { type: '' });
    expect(isSupportedUploadFile(file)).toBe(true);
  });

  it('rejects PDF files', () => {
    const file = new File([''], 'resume.pdf', { type: 'application/pdf' });
    expect(isSupportedUploadFile(file)).toBe(false);
  });

  it('rejects Word documents', () => {
    const file = new File([''], 'resume.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(isSupportedUploadFile(file)).toBe(false);
  });

  it('rejects arbitrary binary files', () => {
    const file = new File([''], 'data.bin', { type: 'application/octet-stream' });
    expect(isSupportedUploadFile(file)).toBe(false);
  });

  it('rejects files with no recognizable extension or MIME', () => {
    const file = new File([''], 'unknown.xyz', { type: '' });
    expect(isSupportedUploadFile(file)).toBe(false);
  });
});
