// A dynamic import() that retries before giving up. A success is kept; a failure is
// forgotten, so the next load() tries again without a page reload. Webpack also forgets a
// failed chunk and requests it anew, whereas React.lazy and next/dynamic keep their first
// rejection for the life of the page.
export function retryingImport(load, delays = [500, 1500]) {
  let pending = null, value;
  return {
    get value() { return value; },
    load() {
      pending ??= (async () => {
        for (let attempt = 0; ; attempt++) {
          try { return (value = await load()); }
          catch (error) {
            if (attempt >= delays.length) throw error;
            await new Promise(resolve => setTimeout(resolve, delays[attempt]));
          }
        }
      })().catch(error => { pending = null; throw error; });
      return pending;
    },
  };
}
