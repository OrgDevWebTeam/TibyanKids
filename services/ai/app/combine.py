# Merges the findings of the two recitation models into one list (taxonomy 1.1 and 4, rule 2).
from app.policy import CATEGORY_ORDER, make_finding

CODES_MUAALEM_SHOULD_HEAR = {"ERR_MEM_OMISSION", "ERR_MEM_SUBSTITUTION"}


def is_more_important(finding, other):
    """True when finding's category comes before other's (memorization, pronunciation, tajweed)."""
    return CATEGORY_ORDER.index(finding.category) < CATEGORY_ORDER.index(other.category)


def combine_findings(muaalem_findings, whisper_findings):
    """One finding per word; a word whisper calls wrong but muaalem heard fine becomes a disagreement."""
    muaalem_words = {finding.wordIndex for finding in muaalem_findings}
    combined = {finding.wordIndex: finding for finding in muaalem_findings}

    for finding in whisper_findings:
        word = finding.wordIndex
        if finding.code in CODES_MUAALEM_SHOULD_HEAR and word not in muaalem_words:
            combined[word] = make_finding(
                word, "ERR_TECH_MODELS_DISAGREE", finding.confidence, finding.wordStartMs, finding.wordEndMs
            )
        elif word not in combined or is_more_important(finding, combined[word]):
            combined[word] = finding

    return [combined[word] for word in sorted(combined)]
