/**
 * Hint system module
 * Handles letter reveals and attribute clues
 */

const Hints = (function() {
  const LETTER_HINT_COST = 10;
  const ATTRIBUTE_HINT_COST = 5;

  let targetAnimal = null;
  let revealedLetters = []; // Array of indices
  let revealedAttributes = []; // Array of attribute names
  let onUpdateCallback = null;

  const ATTRIBUTE_LABELS = {
    class: 'Class',
    habitat: 'Habitat',
    diet: 'Diet',
    size: 'Size'
  };

  function init(animal, onUpdate) {
    targetAnimal = animal;
    revealedLetters = [];
    revealedAttributes = [];
    onUpdateCallback = onUpdate;
  }

  function loadState(state) {
    if (state.revealedLetters) {
      revealedLetters = state.revealedLetters;
    }
    if (state.revealedAttributes) {
      revealedAttributes = state.revealedAttributes;
    }
  }

  function getState() {
    return {
      revealedLetters: [...revealedLetters],
      revealedAttributes: [...revealedAttributes]
    };
  }

  // Get all letter positions (excluding spaces)
  function getLetterPositions() {
    const positions = [];
    const name = targetAnimal.name;
    for (let i = 0; i < name.length; i++) {
      if (name[i] !== ' ') {
        positions.push(i);
      }
    }
    return positions;
  }

  // Reveal a random unrevealed letter
  function revealLetter() {
    const allPositions = getLetterPositions();
    const unrevealedPositions = allPositions.filter(pos => !revealedLetters.includes(pos));

    if (unrevealedPositions.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * unrevealedPositions.length);
    const position = unrevealedPositions[randomIndex];

    revealedLetters.push(position);
    revealedLetters.sort((a, b) => a - b);

    if (onUpdateCallback) {
      onUpdateCallback();
    }

    return {
      position,
      letter: targetAnimal.name[position],
      cost: LETTER_HINT_COST
    };
  }

  // Reveal a random unrevealed attribute
  function revealAttribute() {
    const allAttributes = Object.keys(targetAnimal.attributes);
    const unrevealedAttributes = allAttributes.filter(attr => !revealedAttributes.includes(attr));

    if (unrevealedAttributes.length === 0) {
      return null;
    }

    const randomIndex = Math.floor(Math.random() * unrevealedAttributes.length);
    const attribute = unrevealedAttributes[randomIndex];

    revealedAttributes.push(attribute);

    if (onUpdateCallback) {
      onUpdateCallback();
    }

    return {
      attribute,
      label: ATTRIBUTE_LABELS[attribute],
      value: targetAnimal.attributes[attribute],
      cost: ATTRIBUTE_HINT_COST
    };
  }

  function canRevealLetter() {
    const allPositions = getLetterPositions();
    return revealedLetters.length < allPositions.length;
  }

  function canRevealAttribute() {
    const allAttributes = Object.keys(targetAnimal.attributes);
    return revealedAttributes.length < allAttributes.length;
  }

  function getNameDisplay() {
    const name = targetAnimal.name;
    const display = [];

    for (let i = 0; i < name.length; i++) {
      if (name[i] === ' ') {
        display.push({ type: 'space' });
      } else if (revealedLetters.includes(i)) {
        display.push({ type: 'revealed', letter: name[i] });
      } else {
        display.push({ type: 'blank' });
      }
    }

    return display;
  }

  function getRevealedAttributesList() {
    return revealedAttributes.map(attr => ({
      attribute: attr,
      label: ATTRIBUTE_LABELS[attr],
      value: targetAnimal.attributes[attr]
    }));
  }

  function getHintPenalty() {
    return (revealedLetters.length * LETTER_HINT_COST) +
           (revealedAttributes.length * ATTRIBUTE_HINT_COST);
  }

  function getHintCounts() {
    return {
      letters: revealedLetters.length,
      attributes: revealedAttributes.length
    };
  }

  return {
    init,
    loadState,
    getState,
    revealLetter,
    revealAttribute,
    canRevealLetter,
    canRevealAttribute,
    getNameDisplay,
    getRevealedAttributesList,
    getHintPenalty,
    getHintCounts,
    LETTER_HINT_COST,
    ATTRIBUTE_HINT_COST
  };
})();
