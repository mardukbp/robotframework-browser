*** Settings ***
Documentation     The aria_label rule of the RecorderSelectors plugin: Playwright records an
...               element whose role and aria-label are not unique, such as the value help icon
...               of a SAP Fiori input, by its id; the rule records it by its role and
...               aria-label, scoped by the label of its input, also when the value help dialog
...               the click opens hides the form with aria-hidden. A selector Playwright already
...               made from a role and a name is kept, matched exactly.

Library           Browser    plugins=${CURDIR}/../RecorderSelectors,${CURDIR}/HookProbe.py
Resource          recorder.resource

Test Setup        Open Page With Value Help Fields
Test Teardown     Close Page    ALL

Test Tags         recorder


*** Test Cases ***
A Value Help That Playwright Records By Its Role And Name Is Kept And Matched Exactly
    Remove Fields Except    APD_::SalesOrderType
    ${selector} =    Recorded Click
    ...    id=APD_::SalesOrderType-inner-vhi
    ...    internal:role=button[name="Wertehilfe einblenden"i]
    Should Be Equal    ${selector}    internal:role=button[name="Wertehilfe einblenden"s]
    Get Attribute    ${selector}    id    ==    APD_::SalesOrderType-inner-vhi

A Recorded Value Help Is Scoped By The Input It Belongs To
    ${selector} =    Recorded Click
    ...    id=APD_::SalesOrganization-inner-vhi
    ...    [id="APD_::SalesOrganization-inner-vhi"]
    Should Be Equal
    ...    ${selector}
    ...    role=button[name="Wertehilfe einblenden"s] >> scope="Verkaufsorganisation"
    Get Attribute    ${selector}    id    ==    APD_::SalesOrganization-inner-vhi

A Recorded Value Help Is Scoped By Its Input Although The Opened Dialog Hides The Form
    Evaluate JavaScript    id=form
    ...    (form) => form.addEventListener('click', () => form.setAttribute('aria-hidden', 'true'))
    ${selector} =    Recorded Click
    ...    id=APD_::SalesOrderType-inner-vhi
    ...    [id="APD_::SalesOrderType-inner-vhi"]
    Should Be Equal
    ...    ${selector}
    ...    role=button[name="Wertehilfe einblenden"s] >> scope="Kundenauftragsart"
    Evaluate JavaScript    id=form    (form) => form.removeAttribute('aria-hidden')
    Get Attribute    ${selector}    id    ==    APD_::SalesOrderType-inner-vhi

A Recorded Value Help Of An Input Without A Name Is Recorded By Its Role, Aria Label And Index
    ${selector} =    Recorded Click    id=APD_::Note-inner-vhi    [id="APD_::Note-inner-vhi"]
    Should Be Equal    ${selector}    role=button[name="Wertehilfe einblenden"s] >> nth=2
    Get Attribute    ${selector}    id    ==    APD_::Note-inner-vhi

A Tooltip Inside The Label Of Its Field Is Scoped By The Text Before It
    Add Elements
    ...    <label for="modell">Modell <a id="modell-tip" role="button" aria-label="Information anzeigen" tabindex="0">i</a></label>
    ...    <select id="modell"></select>
    ...    <label for="hersteller">Hersteller Ihres Fahrzeuges <a id="hersteller-tip" role="button" aria-label="Information anzeigen" tabindex="0">i</a></label>
    ...    <select id="hersteller"></select>
    ${selector} =    Recorded Click
    ...    id=hersteller-tip
    ...    internal:role=button[name="Information anzeigen"i] >> nth=1
    Should Be Equal
    ...    ${selector}
    ...    role=button[name="Information anzeigen"s] >> scope="Hersteller Ihres Fahrzeuges"
    Get Attribute    ${selector}    id    ==    hersteller-tip


*** Keywords ***
Open Page With Value Help Fields
    Open Test Page
    VAR    ${icon} =      style="display:inline-block;width:1em;height:1em;border:1px solid"
    Add Elements
    ...                   <section id="form" role="form" aria-label="Kundenauftrag anlegen">
    ...                   <div class="field" id="APD_::SalesOrderType"><label id="__label9" for="APD_::SalesOrderType-inner-inner" aria-label="Kundenauftragsart">Kundenauftragsart</label>
    ...                   <div><input id="APD_::SalesOrderType-inner-inner" role="combobox" aria-labelledby="__label9">
    ...                   <div><span id="APD_::SalesOrderType-inner-vhi" role="button" aria-label="Wertehilfe einblenden" ${icon}></span></div></div></div>
    ...                   <div class="field" id="APD_::SalesOrganization"><label id="__label10" for="APD_::SalesOrganization-inner-inner" aria-label="Verkaufsorganisation">Verkaufsorganisation</label>
    ...                   <div><input id="APD_::SalesOrganization-inner-inner" role="combobox" aria-labelledby="__label10">
    ...                   <div><span id="APD_::SalesOrganization-inner-vhi" role="button" aria-label="Wertehilfe einblenden" ${icon}></span></div></div></div>
    ...                   <div class="field" id="APD_::Note">
    ...                   <div><input id="APD_::Note-inner-inner" role="combobox">
    ...                   <div><span id="APD_::Note-inner-vhi" role="button" aria-label="Wertehilfe einblenden" ${icon}></span></div></div></div>
    ...                   </section>

Remove Fields Except
    [Arguments]            ${field_id}
    Evaluate JavaScript
    ...                    ${None}
    ...                    (id) => document.querySelectorAll('.field').forEach((field) => field.id !== id && field.remove())
    ...                    arg=${field_id}
