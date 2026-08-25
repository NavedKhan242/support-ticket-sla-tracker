import { appError } from "./errors";

export function validateTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) throw appError("Ticket title cannot be empty", "VALIDATION_ERROR");
  if (trimmed.length > 255) throw appError("Ticket title must not exceed 255 characters", "VALIDATION_ERROR");
  return trimmed;
}

export function validateDescription(description: string): string {
  const trimmed = description.trim();
  if (!trimmed) throw appError("Ticket description cannot be empty", "VALIDATION_ERROR");
  if (trimmed.length > 5000) throw appError("Ticket description must not exceed 5000 characters", "VALIDATION_ERROR");
  return trimmed;
}

export function validateCommentContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) throw appError("Comment content cannot be empty", "VALIDATION_ERROR");
  if (trimmed.length > 5000) throw appError("Comment content must not exceed 5000 characters", "VALIDATION_ERROR");
  return trimmed;
}
