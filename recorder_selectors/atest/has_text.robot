*** Settings ***
Documentation     The has_text rule of the RecorderSelectors plugin: an element Playwright
...               records by CSS with :has-text(), such as label:has-text("Ja"), is recorded by
...               its own text, scoped by the text before it when the text alone is not unique.

Library           Browser    plugins=${CURDIR}/../RecorderSelectors,${CURDIR}/HookProbe.py
Resource          recorder.resource

Test Setup        Open Page With A Yes No Question
Test Teardown     Close Page    ALL

Test Tags         recorder


*** Test Cases ***
An Option Whose Text Is Unique Is Recorded By Its Text
    ${selector} =    Recorded Click    id=konto-ja-label    label >> internal:has-text="Ja"i
    Should Be Equal    ${selector}    text="Ja"
    Get Attribute    ${selector}    for    ==    konto-ja

An Option Whose Text Is Used Again Is Recorded By Its Text, Scoped By Its Question
    Add Elements    <dialog open><p>Wirklich?</p><button>Ja</button></dialog>
    ${selector} =    Recorded Click    id=konto-ja-label    label >> internal:has-text="Ja"i
    Should Be Equal    ${selector}    text="Ja" >> scope="Ist der Antragsteller auch der Kontoinhaber?*"
    Get Attribute    ${selector}    for    ==    konto-ja

The CSS Form Of The Filter Is Recorded By Its Text Too
    Add Elements    <dialog open><p>Wirklich?</p><button>Ja</button></dialog>
    ${selector} =    Recorded Click    id=konto-ja-label    label:has-text("Ja")
    Should Be Equal    ${selector}    text="Ja" >> scope="Ist der Antragsteller auch der Kontoinhaber?*"
    Get Attribute    ${selector}    for    ==    konto-ja


*** Keywords ***
Open Page With A Yes No Question
    Open Test Page
    Add Elements
    ...    <label>Ist der Antragsteller auch der Kontoinhaber?*</label><div class="radio-list">
    ...    <div><input type="radio" name="konto" id="konto-ja"><label id="konto-ja-label" for="konto-ja">Ja</label></div>
    ...    <div><input type="radio" name="konto" id="konto-nein"><label for="konto-nein">Nein</label></div></div>
