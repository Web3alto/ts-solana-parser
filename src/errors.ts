import type { ZodIssue } from 'zod'

export class ParserError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ParserError'
  }
}

export class UnsupportedEncodingError extends ParserError {
  constructor(encoding: string) {
    super(`Unsupported transaction encoding: "${encoding}"`)
    this.name = 'UnsupportedEncodingError'
  }
}

export class DecodeError extends ParserError {
  constructor(message: string) {
    super(message)
    this.name = 'DecodeError'
  }
}

export class ValidationError extends ParserError {
  readonly issues: ZodIssue[]
  constructor(issues: ZodIssue[]) {
    super(`Invalid input: ${issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`)
    this.name = 'ValidationError'
    this.issues = issues
  }
}
