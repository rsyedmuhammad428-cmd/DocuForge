import path from 'node:path'
import type { EngineOperation } from '../../shared/engine-protocol'
import type { JobOperation, JobRequest } from '../../shared/jobs'
import type { FileRegistry } from './file-registry'

/** A request that has been checked and turned into something the engine can run. */
export interface PreparedJob {
  operation: JobOperation
  title: string
  engine: { op: EngineOperation; args: Record<string, unknown> }
  /** Folder where the job writes, used to sweep leftover temp files. */
  outputDirectory: string
  /** File names (not paths) of the inputs, for the history list. */
  inputNames: string[]
}

export class JobRequestError extends Error {}

function samePath(a: string, b: string): boolean {
  const normalize = (value: string): string => {
    const resolved = path.resolve(value)
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
  }
  return normalize(a) === normalize(b)
}

/**
 * Turns a page request (ids) into an engine request (real paths).
 * Every id must have been issued by a native dialog, and the output may never be an input.
 */
export function prepareJob(request: JobRequest, registry: FileRegistry): PreparedJob {
  const built = buildJob(request, registry)
  const ids = 'inputIds' in request ? request.inputIds : [request.inputId]
  const inputNames = ids.flatMap((id) => registry.getInput(id)?.name ?? [])
  return { ...built, inputNames }
}

function buildJob(request: JobRequest, registry: FileRegistry): Omit<PreparedJob, 'inputNames'> {
  const requireInput = (id: string) => {
    const input = registry.getInput(id)
    if (input === undefined) {
      throw new JobRequestError('A selected file is no longer available. Add it again.')
    }
    return input
  }
  const requireOutput = (id: string, kind: 'file' | 'folder') => {
    const output = registry.getOutput(id)
    if (output?.kind !== kind) {
      throw new JobRequestError('The save location is no longer valid. Choose it again.')
    }
    return output
  }

  const rejectOverwrite = (inputs: readonly { path: string }[], outputPath: string, message: string): void => {
    if (inputs.some((input) => samePath(input.path, outputPath))) throw new JobRequestError(message)
  }

  switch (request.operation) {
    case 'merge': {
      const inputs = request.inputIds.map(requireInput)
      const output = requireOutput(request.outputId, 'file')
      if (inputs.some((input) => samePath(input.path, output.path))) {
        throw new JobRequestError('The merged file cannot replace one of the files being merged.')
      }
      return {
        operation: 'merge',
        title: `Merge ${inputs.length} PDFs`,
        engine: { op: 'merge', args: { inputs: inputs.map((i) => i.path), output: output.path } },
        outputDirectory: path.dirname(output.path),
      }
    }

    case 'split': {
      const input = requireInput(request.inputId)
      const output = requireOutput(request.outputId, 'folder')
      return {
        operation: 'split',
        title: `Split ${input.name}`,
        engine: {
          op: 'split',
          args: {
            input: input.path,
            outputDir: output.path,
            baseName: path.parse(input.name).name,
            mode: request.mode,
            ranges: request.ranges?.map((r) => [r.start, r.end]),
            chunkSize: request.chunkSize,
          },
        },
        outputDirectory: output.path,
      }
    }

    case 'pdf_to_images': {
      const input = requireInput(request.inputId)
      const output = requireOutput(request.outputId, 'folder')
      return {
        operation: 'pdf_to_images',
        title: `Convert ${input.name} to images`,
        engine: {
          op: 'pdf_to_images',
          args: {
            input: input.path,
            outputDir: output.path,
            baseName: path.parse(input.name).name,
            format: request.format,
            dpi: request.dpi,
            ranges: request.ranges?.map((r) => [r.start, r.end]),
          },
        },
        outputDirectory: output.path,
      }
    }

    case 'images_to_pdf': {
      const inputs = request.inputIds.map(requireInput)
      const output = requireOutput(request.outputId, 'file')
      rejectOverwrite(inputs, output.path, 'The PDF must be saved under a different name than the images.')
      return {
        operation: 'images_to_pdf',
        title: `Convert ${inputs.length === 1 ? '1 image' : `${inputs.length} images`} to PDF`,
        engine: {
          op: 'images_to_pdf',
          args: { inputs: inputs.map((i) => i.path), output: output.path, pageSize: request.pageSize },
        },
        outputDirectory: path.dirname(output.path),
      }
    }

    case 'pdf_to_text': {
      const input = requireInput(request.inputId)
      const output = requireOutput(request.outputId, 'file')
      rejectOverwrite([input], output.path, 'The text file must not replace the PDF.')
      return {
        operation: 'pdf_to_text',
        title: `Extract text from ${input.name}`,
        engine: {
          op: 'pdf_to_text',
          args: {
            input: input.path,
            output: output.path,
            pageMarkers: request.pageMarkers,
            ranges: request.ranges?.map((r) => [r.start, r.end]),
          },
        },
        outputDirectory: path.dirname(output.path),
      }
    }

    case 'text_to_pdf':
    case 'document_to_pdf': {
      const input = requireInput(request.inputId)
      const output = requireOutput(request.outputId, 'file')
      rejectOverwrite([input], output.path, 'The PDF must be saved under a different name than the original.')
      return {
        operation: request.operation,
        title: `Convert ${input.name} to PDF`,
        engine: { op: request.operation, args: { input: input.path, output: output.path } },
        outputDirectory: path.dirname(output.path),
      }
    }

    case 'pdf_to_docx': {
      const input = requireInput(request.inputId)
      const output = requireOutput(request.outputId, 'file')
      rejectOverwrite([input], output.path, 'The Word file must not replace the PDF.')
      return {
        operation: 'pdf_to_docx',
        title: `Convert ${input.name} to Word`,
        engine: {
          op: 'pdf_to_docx',
          args: { input: input.path, output: output.path, ranges: request.ranges?.map((r) => [r.start, r.end]) },
        },
        outputDirectory: path.dirname(output.path),
      }
    }

    case 'ocr': {
      const input = requireInput(request.inputId)
      const output = requireOutput(request.outputId, 'file')
      rejectOverwrite([input], output.path, 'Save the result under a different name. The original is never changed.')
      return {
        operation: 'ocr',
        title: `Recognize text in ${input.name}`,
        engine: {
          op: 'ocr',
          args: {
            input: input.path,
            output: output.path,
            format: request.format,
            languages: request.languages,
            dpi: request.dpi,
            useExistingText: request.useExistingText,
            pageMarkers: request.pageMarkers,
            ranges: request.ranges?.map((r) => [r.start, r.end]),
          },
        },
        outputDirectory: path.dirname(output.path),
      }
    }

    case 'compress': {
      const input = requireInput(request.inputId)
      const output = requireOutput(request.outputId, 'file')
      rejectOverwrite([input], output.path, 'Save the smaller PDF under a different name. The original is never changed.')
      return {
        operation: 'compress',
        title: `Compress ${input.name}`,
        engine: {
          op: 'compress',
          args: { input: input.path, output: output.path, preset: request.preset },
        },
        outputDirectory: path.dirname(output.path),
      }
    }

    case 'organize': {
      const input = requireInput(request.inputId)
      const output = requireOutput(request.outputId, 'file')
      if (samePath(input.path, output.path)) {
        throw new JobRequestError('Save the result under a different name. The original is never changed.')
      }
      return {
        operation: 'organize',
        title: `Organize ${input.name}`,
        engine: {
          op: 'organize_export',
          args: { input: input.path, output: output.path, pages: request.pages },
        },
        outputDirectory: path.dirname(output.path),
      }
    }
  }
}
