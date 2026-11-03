from backend.app.domain.classify import classify_functional_category, derive_functional_tags, parse_type_line
from backend.app.domain.names import edhrec_slug, normalize_card_name, partner_pair_slug
from backend.app.domain.parsing import parse_card_lines, parse_collection, parse_csv_collection
from backend.app.domain.partners import compatible_partners, detect_partner_type


def test_normalize_keeps_front_face():
    assert normalize_card_name("  Etali, Primal Conqueror // Etali, Primal Sickness ") == "etali, primal conqueror"


def test_edhrec_slug_strips_punctuation_and_accents():
    assert edhrec_slug("Mr. House, President and CEO") == "mr-house-president-and-ceo"
    assert edhrec_slug("Altaïr Ibn-La'Ahad") == "altair-ibn-laahad"


def test_partner_pair_slug_is_alphabetical():
    assert partner_pair_slug("Tymna the Weaver", "Thrasios, Triton Hero") == "thrasios-triton-hero-tymna-the-weaver"


def test_parse_card_lines_handles_quantities():
    assert parse_card_lines("2 Sol Ring\n1x Swamp\nIsland\n\nSol Ring") == {"sol ring": 3, "swamp": 1, "island": 1}


def test_parse_csv_collection_sums_quantities():
    csv = "Name,Quantity,Set\nSol Ring,2,C21\nSol Ring,1,CMR\nIsland,,X\n"
    assert parse_csv_collection(csv) == {"sol ring": 3, "island": 1}


def test_parse_collection_sniffs_csv_without_filename():
    assert parse_collection("Name,Qty,Set\nSol Ring,1,C21\n") == {"sol ring": 1}
    assert parse_collection("1 Sol Ring") == {"sol ring": 1}


def test_parse_type_line_uses_front_face():
    assert parse_type_line("Legendary Creature — Human // Land") == "Creature"
    assert parse_type_line("Artifact Land") == "Artifact"
    assert parse_type_line("Tribal Instant") == "Instant"


def test_detect_partner_type():
    assert detect_partner_type({"keywords": ["Partner"]}) == "partner"
    assert detect_partner_type({"oracle_text": "Partner with Pir, Imaginative Rascal"}) == "partner_with"
    assert detect_partner_type({"oracle_text": "Partner—Father & Son"}) == "partner_variant"
    assert detect_partner_type({"type_line": "Legendary Enchantment — Background"}) == "background"
    assert detect_partner_type({"oracle_text": "Flying"}) == ""


def test_compatible_partners_excludes_self():
    a = {"name_normalized": "a", "partner_type": "partner"}
    b = {"name_normalized": "b", "partner_type": "partner"}
    bg = {"name_normalized": "bg", "partner_type": "background"}
    assert compatible_partners(a, [a, b, bg]) == [b]
    assert compatible_partners(bg, [a, b, {"name_normalized": "c", "partner_type": "choose_a_background"}]) == [
        {"name_normalized": "c", "partner_type": "choose_a_background"}]


def test_classify_functional_category():
    td = {"top_mana_artifacts": [{"name_normalized": "sol ring"}], "high_synergy": [{"name_normalized": "x"}]}
    assert classify_functional_category("plains", "Land", td) == "lands"
    assert classify_functional_category("sol ring", "Artifact", td) == "ramp"
    assert classify_functional_category("rampant growth", "Sorcery", td, "search your library for a basic land") == "ramp"
    assert classify_functional_category("divination", "Sorcery", td, "draw two cards") == "cardDraw"
    assert classify_functional_category("swords", "Instant", td, "exile target creature") == "removal"
    assert classify_functional_category("x", "Creature", td, "flying") == "synergy"
    assert classify_functional_category("y", "Creature", td, "flying") == "utility"


def test_derive_functional_tags():
    assert {"ramp", "draw"} <= derive_functional_tags("add {g}. draw a card.")
    assert derive_functional_tags("flying") == set()
