*** Settings ***
Documentation     The exact_names rule of the RecorderSelectors plugin: the text an element is
...               recorded by is matched exactly, as text="..." when the element's own text
...               nodes hold it.

Library           Browser    plugins=${CURDIR}/../RecorderSelectors,${CURDIR}/HookProbe.py
Resource          recorder.resource

Test Setup        Open Test Page
Test Teardown     Close Page    ALL

Test Tags         recorder


*** Test Cases ***
A Click On The Label Of A Radio Is Recorded By Its Exact Text
    Add Elements
    ...    <p><input type="radio" name="moped" id="moped45kmh"><label for="moped45kmh">bis 45&nbsp;km/h</label>
    ...    <input type="radio" name="moped" id="moped60kmh"><label for="moped60kmh">46&nbsp;km/h bis 60&nbsp;km/h</label></p>
    ${click} =    Recorded Click    css=label[for=moped60kmh]    internal:text="km/h bis 60 km/h"i
    ${check} =    Recorded Selector    check    internal:role=radio[name="km/h bis 60 km/h"i]
    Should Be Equal    ${click}    text="46 km/h bis 60 km/h"
    Should Be Equal    ${check}    internal:role=radio[name="46 km/h bis 60 km/h"s]
    Get Attribute    ${click}    for    ==    moped60kmh
    Get Attribute    ${check}    id    ==    moped60kmh

A Link That Navigates Away Is Recorded By Its Exact Name Without Its Title
    [Documentation]    Playwright tells the link from the other one by the description its
    ...    title gives it; the exact name is enough, checked before the click.
    Add Akademie Links
    ${selector} =    Recorded Click
    ...    css=a[href="?akademie"]
    ...    internal:role=link[name="Akademie"i][description="Akademie"i]
    Should Be Equal    ${selector}    internal:role=link[name="Akademie"s]
    Close Page
    Open Test Page
    Add Akademie Links
    Get Attribute    ${selector}    href    ==    ?akademie

A Link Whose Click Brings More Such Links Is Recorded By Its Exact Name
    [Documentation]    After the click the recorded role=link[name*="Akademie"i] finds two
    ...    links; the exact name is checked before the click.
    Add Elements    <nav id="menu"><a href="\#akademie">Akademie</a></nav>
    Evaluate JavaScript
    ...    id=menu
    ...    (menu) => menu.addEventListener('click', () => { menu.innerHTML = '<a href="#1">Akademie Kurse</a><a href="#2">Warum Akademie</a>'; })
    ${selector} =    Recorded Click    css=#menu a    internal:role=link[name="Akademie"i]
    Should Be Equal    ${selector}    internal:role=link[name="Akademie"s]


*** Keywords ***
Add Akademie Links
    Add Elements
    ...             <nav><a href="?akademie" title="Akademie">Akademie</a>
    ...             <a href="\#kurse" title="Akademie">Kurse und Termine</a>
    ...             <a href="\#warum" title="Warum imbus">Warum imbus Akademie</a></nav>
