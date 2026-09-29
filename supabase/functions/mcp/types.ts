/** One `api_v1` operation as the catalog script reads it from the database. */
export interface ApiV1Operation {
  name: string
  purpose: string
  inputs: string
  returns?: string
  errors: string
  args: readonly { name: string; type: string; required: boolean }[]
}
