export type ConversionId =
  | 'pdf-to-images'
  | 'images-to-pdf'
  | 'pdf-to-text'
  | 'text-to-pdf'
  | 'document-to-pdf'
  | 'pdf-to-word'

export interface ConversionDefinition {
  id: ConversionId
  label: string
  description: string
  /** An honest limit the user should know before converting. */
  limitation: string
}

/**
 * Every conversion the app offers. A conversion is listed here only when it is built and tested,
 * so the screen can never show one that does not work.
 */
export const CONVERSIONS: readonly ConversionDefinition[] = [
  {
    id: 'pdf-to-images',
    label: 'PDF to images',
    description: 'Save each page as a PNG or JPEG picture.',
    limitation: 'Pages become pictures, so their text can no longer be selected.',
  },
  {
    id: 'images-to-pdf',
    label: 'Images to PDF',
    description: 'Combine pictures into one PDF, one picture per page.',
    limitation:
      'PNG, JPEG, GIF, BMP, TIFF and WebP. Animated images and multi-page TIFFs use their first frame.',
  },
  {
    id: 'pdf-to-text',
    label: 'PDF to text',
    description: 'Copy the text out of a PDF into a .txt file.',
    limitation:
      'Only works for PDFs that contain real text. Scanned PDFs are pictures and need OCR, which is not available yet.',
  },
  {
    id: 'text-to-pdf',
    label: 'Text to PDF',
    description: 'Turn a .txt file into a PDF.',
    limitation:
      'Plain text on A4 pages. Latin, Cyrillic, Greek and Arabic-script text (including Urdu) is supported. Chinese, Japanese, Korean and emoji may not display.',
  },
  {
    id: 'document-to-pdf',
    label: 'Word to PDF',
    description: 'Convert a Word document to PDF.',
    limitation:
      '.docx files convert with no extra software, keeping text, headings, lists, tables and pictures but not headers, footers or exact page layout. The free LibreOffice, if installed, gives a closer layout and adds .doc, .odt and .rtf.',
  },
  {
    id: 'pdf-to-word',
    label: 'PDF to Word',
    description: 'Turn a PDF into an editable Word (.docx) file.',
    limitation:
      'Works for PDFs with real text. The layout is rebuilt automatically, so check pages with tables, columns or unusual fonts. Scanned PDFs need OCR first.',
  },
]
