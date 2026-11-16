*** Settings ***
Documentation     The exact_names rule of the RecorderSelectors plugin: the text an element is
...               recorded by is matched exactly, as text="..." when the element's own text
...               nodes hold it.

Library           Browser                     plugins=${CURDIR}/../RecorderSelectors
Resource          recorder.resource

Suite Setup       Allow Recording Headless    ${True}
Suite Teardown    Allow Recording Headless    ${False}
Test Setup        Open Recorder Page
Test Teardown     Run Keywords                End Any Session                                                       AND    Close Page    ALL    AND    Wait For All Promises

Test Tags         recorder


*** Test Cases ***
A Click On The Label Of A Radio Is Recorded By Its Exact Text
    Add Elements
    ...                        <p><input type="radio" name="moped" id="moped45kmh"><label for="moped45kmh">bis 45&nbsp;km/h</label>
    ...                        <input type="radio" name="moped" id="moped60kmh"><label for="moped60kmh">46&nbsp;km/h bis 60&nbsp;km/h</label></p>
    ${promise} =               Promise To
    ...                        Record Keyword
    ...                        Choose Moped
    ...                        ${None}
    Toolbar State Should Be    recording
    Click                      css=label[for=moped60kmh]
    Wait Until Calls           2
    ${calls} =                 Evaluate JavaScript
    ...                        ${None}
    ...                        () => window.__rfbToolbarState.calls.map((call) => [call.keyword, call.values[0].raw])
    Send Command               {cmd: 'stop'}
    Wait For                   ${promise}
    Should Be Equal
    ...                        ${calls}
    ...                        ${{[['Click', 'text="46 km/h bis 60 km/h"'], ['Check Checkbox', 'role=radio[name="46 km/h bis 60 km/h"s]']]}}
    Get Attribute
    ...                        text="46 km/h bis 60 km/h"
    ...                        for
    ...                        ==
    ...                        moped60kmh

A Link That Navigates Away Is Recorded By Its Exact Name Without Its Title
    [Documentation]    Playwright tells the link from the other one by the description its
    ...    title gives it; the exact name is enough, checked against the snapshot of the press.
    Add Akademie Links
    ${selector} =         Record Click    css=a[href="?akademie"]
    Should Be Equal       ${selector}     role=link[name="Akademie"s]
    Close Page
    Open Recorder Page
    Add Akademie Links
    Get Attribute         ${selector}     href                           ==    ?akademie

A Link Whose Click Brings More Such Links Is Recorded By Its Exact Name
    [Documentation]    After the click the recorded role=link[name*="Akademie"i] finds two
    ...    links; the exact name is checked against the snapshot of the press.
    Add Elements
    ...                    <nav id="menu"><a href="\#akademie">Akademie</a></nav>
    Evaluate JavaScript
    ...                    id=menu
    ...                    (menu) => menu.addEventListener('click', () => { menu.innerHTML = '<a href="#1">Akademie Kurse</a><a href="#2">Warum Akademie</a>'; })
    ${selector} =          Record Click
    ...                    css=#menu a
    Should Be Equal
    ...                    ${selector}
    ...                    role=link[name="Akademie"s]


*** Keywords ***
Add Akademie Links
    Add Elements
    ...             <nav><a href="?akademie" title="Akademie">Akademie</a>
    ...             <a href="\#kurse" title="Akademie">Kurse und Termine</a>
    ...             <a href="\#warum" title="Warum imbus">Warum imbus Akademie</a></nav>
