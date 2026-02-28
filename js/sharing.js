/**
 * Sharing module
 * Generates shareable emoji grid results
 */

const Sharing = (function() {
  const EMOJI = {
    correct: '\u{1F7E9}', // Green square
    close: '\u{1F7E8}',   // Yellow square
    wrong: '\u{2B1C}',    // White square
    win: '\u{2705}',      // Check mark
    paw: '\u{1F43E}',     // Paw print
    letter: '\u{1F524}',  // Letters emoji
    chart: '\u{1F4CA}'    // Chart emoji
  };

  function generateShareText(gameResult) {
    const {
      gameNumber,
      score,
      guessHistory,
      hintCounts,
      won
    } = gameResult;

    let text = `${EMOJI.paw} Animaldle #${gameNumber} ${EMOJI.paw}\n`;
    text += `Score: ${score}/100\n\n`;

    guessHistory.forEach((guess, index) => {
      const isLast = index === guessHistory.length - 1;
      const row = generateGuessRow(guess);

      if (isLast && won) {
        text += `${row} ${EMOJI.win}\n`;
      } else {
        text += `${row}\n`;
      }
    });

    if (hintCounts.letters > 0 || hintCounts.attributes > 0) {
      text += '\n';
      if (hintCounts.letters > 0) {
        text += `${EMOJI.letter} x${hintCounts.letters} `;
      }
      if (hintCounts.attributes > 0) {
        text += `${EMOJI.chart} x${hintCounts.attributes}`;
      }
      text += '\n';
    }

    text += '\nhttps://connorbach.github.io/fishdle';

    return text;
  }

  function generateGuessRow(guess) {
    const attributes = ['class', 'habitat', 'diet', 'size'];
    return attributes.map(attr => {
      const comparison = guess.comparison[attr];
      switch (comparison.match) {
        case 'exact':
          return EMOJI.correct;
        case 'close':
          return EMOJI.close;
        default:
          return EMOJI.wrong;
      }
    }).join('');
  }

  function generateShareDisplay(gameResult) {
    const { guessHistory, won } = gameResult;

    let html = '<div class="share-grid">';

    guessHistory.forEach((guess, index) => {
      const isLast = index === guessHistory.length - 1;
      const row = generateGuessRow(guess);

      if (isLast && won) {
        html += `<div>${row} ${EMOJI.win}</div>`;
      } else {
        html += `<div>${row}</div>`;
      }
    });

    html += '</div>';
    return html;
  }

  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }

      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      return true;
    } catch (err) {
      console.error('Failed to copy:', err);
      return false;
    }
  }

  async function shareResult(gameResult) {
    const text = generateShareText(gameResult);
    return await copyToClipboard(text);
  }

  return {
    generateShareText,
    generateShareDisplay,
    shareResult,
    copyToClipboard
  };
})();
