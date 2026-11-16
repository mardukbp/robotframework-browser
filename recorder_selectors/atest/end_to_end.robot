*** Settings ***
Documentation       The plugin in a real recording: Browser's recorder gives it the Actions
...                 Playwright reports and writes the keyword from what the plugin gives
...                 back. HookProbe.py, loaded after the plugin, sees those Actions; the session
...                 ends after a short idle timeout. The recorder needs a visible browser.

Library             Browser    plugins=${CURDIR}/../RecorderSelectors,${CURDIR}/HookProbe.py

Suite Setup         New Browser    chromium    headless=False
Suite Teardown      Close Browser    ALL
Test Setup          Open Page To Record
Test Teardown       Run Keywords    Close Context    ALL    AND    Wait For All Promises

Test Tags           recorder    end-to-end


*** Test Cases ***
Every Click Of A Recording Is Rewritten On Its Own
    Add Elements
    ...    <button aria-label="Close dialog" title="Close">Close</button>
    ...    <button aria-label="Open menu" title="Menu">=</button>
    ...    <button aria-label="Open help" title="Help">Help</button>
    ${promise} =    Start Recording    Click Titled
    Click    css=[aria-label="Close dialog"]
    Click    css=[aria-label="Open menu"]
    Click    css=[aria-label="Open help"]
    ${keyword} =    Stop Recording    ${promise}    3
    Should Contain    ${keyword}    Click${SPACE*4}role=button[description="Close"s]\n
    Should Contain    ${keyword}    Click${SPACE*4}role=button[name="Open menu"s]\n
    Should Contain    ${keyword}    Click${SPACE*4}role=button[description="Help"s]\n

A Choice In A Select Is Recorded By The Label Of The Option
    Add Elements
    ...    <label>Make <select id="make"><option value="0: null"></option>
    ...    <option value="14: 6792">AMELUNG</option><option value="15: 0588">AUDI</option></select></label>
    ${promise} =    Start Recording    Choose A Make
    Select Options By    id=make    value    14: 6792
    ${keyword} =    Stop Recording    ${promise}    1
    Should Contain    ${keyword}    ${SPACE*4}label${SPACE*4}AMELUNG\n


*** Keywords ***
Open Page To Record
    [Documentation]    The elements go to the bottom right, away from the recorder's toolbar
    ...    and Playwright's overlay at the top.
    Forget Actions Seen
    New Context
    New Page    ${PAGE_URL}
    Evaluate JavaScript
    ...    ${None}
    ...    () => { document.body.insertAdjacentHTML('beforeend', '<div id="box" style="position:fixed;right:20px;bottom:20px"><button id="probe">Probe</button></div>'); }

Add Elements
    [Arguments]    @{html}
    VAR    ${elements} =    @{html}    separator=${EMPTY}
    Evaluate JavaScript
    ...    id=box
    ...    (box, e) => box.insertAdjacentHTML('afterbegin', e)
    ...    arg=${elements}

Start Recording
    [Documentation]    Starts Record Keyword ``${name}`` and returns its promise once the
    ...    recorder records: until then, the probe button is clicked again.
    [Arguments]    ${name}
    ${promise} =    Promise To    Record Keyword    ${name}    ${None}    idle_timeout=2s
    Wait Until Keyword Succeeds    20s    0.5s    The Probe Is Recorded
    RETURN    ${promise}

The Probe Is Recorded
    Click    id=probe
    ${seen} =    Actions Seen
    Should Not Be Empty    ${seen}

Stop Recording
    [Documentation]    Returns the recorded keyword once the session ended, two seconds after
    ...    the last Action, and checks that the plugin gave ``${count}`` Actions besides the
    ...    probe's.
    [Arguments]    ${promise}    ${count}
    ${keyword} =    Wait For    ${promise}
    Actions Besides The Probe Should Be    ${count}
    RETURN    ${keyword}

Actions Besides The Probe Should Be
    [Arguments]    ${count}
    ${seen} =    Actions Seen
    ${actions} =    Evaluate    [a for a in $seen if 'Probe' not in a.get('selector', '')]
    Length Should Be    ${actions}    ${count}
