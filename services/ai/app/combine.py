# Merges the findings of the two recitation models into one list. Owner: Qussai.
#
# Each model looks for a different kind of mistake (services/ai/README.md):
#   quran-muaalem  listens to sounds: wrong letter, wrong vowel, tajweed
#   whisper-quran  writes down words: skipped, different or extra words
# Rules:
#   1. At most one finding per word (contract). When both models flag the same word, the more
#      important category wins: memorization, then pronunciation, then tajweed (taxonomy 1.1).
#   2. The models disagree on a word when whisper says it was skipped or read as another word, but
#      muaalem heard that word with no error at all. The word then gets ERR_TECH_MODELS_DISAGREE
#      instead, which makes the ayah "uncertain" and sends it to the teacher (taxonomy 4, rule 2).
#      An extra word is not a disagreement: muaalem compares the sounds with the ayah, so it cannot
#      hear a word that is not in it. Errors only muaalem can hear are not disagreements either.
# Nothing is decided here: decide() turns the combined findings into accepted / error / uncertain.
from app.policy import CATEGORY_ORDER, make_finding

# The whisper codes that muaalem should also hear: a skipped or different word changes the sounds
CODES_MUAALEM_SHOULD_HEAR = {"ERR_MEM_OMISSION", "ERR_MEM_SUBSTITUTION"}


def is_more_important(finding, other):
    return CATEGORY_ORDER.index(finding.category) < CATEGORY_ORDER.index(other.category)


def combine_findings(muaalem_findings, whisper_findings):
    """
    Returns one list of findings for the ayah, at most one per word, in word order.
    Each input comes from that adapter's find_errors(), which already gives at most one finding per
    word. The segments are still 0-0: add_word_segments() is called on the result.
    """
    muaalem_words = {finding.wordIndex for finding in muaalem_findings}
    combined = {finding.wordIndex: finding for finding in muaalem_findings}

    for finding in whisper_findings:
        word = finding.wordIndex
        if finding.code in CODES_MUAALEM_SHOULD_HEAR and word not in muaalem_words:
            # Rule 2: whisper says the word is wrong, muaalem heard it fine
            combined[word] = make_finding(
                word, "ERR_TECH_MODELS_DISAGREE", finding.confidence, finding.wordStartMs, finding.wordEndMs
            )
        elif word not in combined or is_more_important(finding, combined[word]):
            # Rule 1. On the same category muaalem's finding stays (whisper only reports memorization
            # and muaalem never does, so this does not happen today)
            combined[word] = finding

    return [combined[word] for word in sorted(combined)]
