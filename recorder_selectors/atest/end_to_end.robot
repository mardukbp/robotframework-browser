*** Settings ***
Documentation       The plugin in a real recording: Browser runs its hook in the page on
...                 each Action as it happens and writes the keyword from what the hook
...                 gives back. The recorder needs a visible browser.

Library             Browser    plugins=${CURDIR}/../RecorderSelectors

Suite Setup         New Browser    chromium    headless=False
Suite Teardown      Close Browser    ALL
Test Setup          Open Page To Record
Test Teardown       Run Keywords    Close Context    ALL    AND    Wait For All Promises

Test Tags           recorder    end-to-end


*** Test Cases ***
Every Click Of A Recording Is Rewritten On Its Own
    Add Elements
    ...    <button aria-label="Close dialog" title="Close">Close</button>
    ...    <button aria-label="Open menu">=</button>
    ...    <button aria-label="Open help" title="Help">Help</button>
    ${promise} =    Start Recording    Click Titled
    Click    css=[aria-label="Close dialog"]
    Click    css=[aria-label="Open menu"]
    Click    css=[aria-label="Open help"]
    ${keyword} =    Stop Recording    ${promise}    3
    Should Contain    ${keyword}    Click${SPACE*4}role=button[description="Close"s]\n
    Should Contain    ${keyword}    Click${SPACE*4}role=button[name="Open menu"s]\n
    Should Contain    ${keyword}    Click${SPACE*4}role=button[description="Help"s]\n

A Choice In A Select Keeps The Value Playwright Recorded
    Add Elements
    ...    <label>Make <select id="make"><option value="0: null"></option>
    ...    <option value="14: 6792">AMELUNG</option><option value="15: 0588">AUDI</option></select></label>
    ${promise} =    Start Recording    Choose A Make
    Select Options By    id=make    value    14: 6792
    ${keyword} =    Stop Recording    ${promise}    1
    Should Contain    ${keyword}    ${SPACE*4}value${SPACE*4}14: 6792\n

A Click On The Label Of An Option Is Recorded By Its Text, Scoped By Its Question
    Add Elements
    ...    <div><label>Ist der Antragsteller auch der Kontoinhaber?*</label>
    ...    <div><input type="radio" name="konto" id="konto-ja"><label for="konto-ja">Ja</label></div>
    ...    <div><input type="radio" name="konto" id="konto-nein"><label for="konto-nein">Nein</label></div></div>
    ...    <div><p>Wirklich?</p><button>Ja</button></div>
    ${promise} =    Start Recording    Answer Ja
    Click    css=label[for="konto-ja"]
    ${keyword} =    Stop Recording    ${promise}    2
    Should Contain
    ...    ${keyword}
    ...    Click${SPACE*4}text="Ja" >> scope="Ist der Antragsteller auch der Kontoinhaber?*"\n


*** Keywords ***
Open Page To Record
    [Documentation]    The elements go to the bottom right, away from the recorder's toolbar
    ...    and Playwright's overlay at the top.
    New Context
    New Page    ${PAGE_URL}
    Evaluate JavaScript
    ...    ${None}
    ...    () => { document.body.insertAdjacentHTML('beforeend', '<div id="box" style="position:fixed;right:20px;bottom:20px"></div>'); }

Add Elements
    [Arguments]    @{html}
    VAR    ${elements} =    @{html}    separator=${EMPTY}
    Evaluate JavaScript
    ...    id=box
    ...    (box, e) => box.insertAdjacentHTML('afterbegin', e)
    ...    arg=${elements}

Start Recording
    [Documentation]    Starts Record Keyword ``${name}`` and returns its promise once the
    ...    toolbar shows that the recorder records.
    [Arguments]    ${name}
    ${promise} =    Promise To    Record Keyword    ${name}    ${None}
    Wait For Function
    ...    () => window.__rfbToolbarState && window.__rfbToolbarState.state === 'recording' && !window.__rfbToolbarState.pending
    RETURN    ${promise}

Stop Recording
    [Documentation]    Returns the recorded keyword once the toolbar shows ``${count}``
    ...    keyword calls, stopping the session through the toolbar's command channel.
    [Arguments]    ${promise}    ${count}
    Wait For Function    () => window.__rfbToolbarState.calls.length === ${count}
    Evaluate JavaScript    ${None}    () => window.__rfbCommand({cmd: 'stop'})
    ${keyword} =    Wait For    ${promise}
    RETURN    ${keyword}
