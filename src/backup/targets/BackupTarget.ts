export type TargetStatus = 'ready' | 'needs-permission' | 'unavailable' | 'not-configured'

/** A place backups are written to. Cloud-API targets can implement this later. */
export interface BackupTarget {
  readonly id: string
  /** Human-readable location, e.g. the folder name. */
  label(): Promise<string | null>
  status(): Promise<TargetStatus>
  /** Must be called from a user gesture when status is 'needs-permission'. */
  requestPermission(): Promise<boolean>
  write(fileName: string, contents: string): Promise<void>
  /** Delete all but the newest `keep` backup files written by Journa. */
  rotate(keep: number): Promise<number>
}
