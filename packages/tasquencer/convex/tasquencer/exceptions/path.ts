import { StructuralIntegrityError } from './base'

export class ElementNotFoundInPathError extends StructuralIntegrityError {
  constructor(elementType: string, path: string[]) {
    super(`${elementType} not found in path ${path.join(' / ')}`, {
      elementType,
      path,
    })
  }
}

export class InvalidPathTraversalError extends StructuralIntegrityError {
  constructor(message: string, path: string[]) {
    super(message, { path })
  }
}
