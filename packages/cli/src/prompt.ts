import { createInterface } from 'node:readline';
import { Writable, type Readable } from 'node:stream';

/** Terminalde yazılanı göstermeden bir satır okur (parola). */
export function promptHidden(question: string, input: Readable, output: Writable): Promise<string> {
  return new Promise((resolve, reject) => {
    let muted = false;
    // Soru gösterildikten sonra yazılan karakterler terminale yansıtılmaz.
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        if (!muted) output.write(chunk);
        callback();
      },
    });
    const rl = createInterface({ input, output: sink, terminal: true });
    rl.question(question, (answer) => {
      rl.close();
      output.write('\n');
      resolve(answer);
    });
    muted = true;
    rl.on('SIGINT', () => {
      rl.close();
      output.write('\n');
      reject(new Error('Cancelled'));
    });
  });
}
