/** An error the person can act on, with the HTTP status the web API answers with. */
export const fail = (status: number, message: string) => Object.assign(new Error(message), { status });
