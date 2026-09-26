import type { MavCmd, MavResult } from '@/libs/connection/m2r/messages/mavlink2rest-enum'

/**
 * A MAVLink command the vehicle acknowledged with a result other than ACCEPTED or IN_PROGRESS, so callers can tell a
 * refusal (and its reason) apart from a lost acknowledgement
 */
export class CommandRejectedError extends Error {
  /**
   * Create the error for a refused command
   * @param {MavCmd} command The command the vehicle refused, e.g. `MAV_CMD_DO_SET_HOME`
   * @param {MavResult} result The result the vehicle answered with, e.g. `MAV_RESULT_TEMPORARILY_REJECTED`
   */
  constructor(readonly command: MavCmd, readonly result: MavResult) {
    super(`Command '${command}' failed with result '${result}'.`)
    this.name = 'CommandRejectedError'
  }
}
