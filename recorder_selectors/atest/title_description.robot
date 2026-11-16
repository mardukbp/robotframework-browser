*** Settings ***
Documentation     The title_description rule of the RecorderSelectors plugin: a click on an
...               element whose title equals its text and is unique on the page is recorded as
...               role=<role>[description="<title>"s] instead of by its name. Any other click,
...               and a picked selector, are kept as Playwright made them.

Library    Browser    plugins=${CURDIR}/../RecorderSelectors
Resource          recorder.resource

Suite Setup       Allow Recording Headless             ${True}
Suite Teardown    Allow Recording Headless             ${False}
Test Setup        Open Recorder Page In New Context
Test Teardown     Run Keywords                         End Any Session                                                       AND    Close Context    ALL    AND    Wait For All Promises

Test Tags         recorder


*** Test Cases ***
A Button Whose Unique Title Is Its Text Is Recorded By Its Description
    Add Elements       <button aria-label="Close dialog" title="Close">Close</button>
    ${selector} =      Record Click
    ...                css=[aria-label="Close dialog"]
    Should Be Equal
    ...                ${selector}
    ...                role=button[description="Close"s]
    Get Attribute
    ...                ${selector}
    ...                aria-label
    ...                ==
    ...                Close dialog

A Link Whose Unique Title Is Its Text Is Recorded By Its Description
    Add Elements       <a href="#help" aria-label="Open help" title="Help">Help</a>
    ${selector} =      Record Click                                                    css=[aria-label="Open help"]
    Should Be Equal    ${selector}                                                     role=link[description="Help"s]
    Get Attribute
    ...                ${selector}
    ...                aria-label
    ...                ==
    ...                Open help

A Button Sharing Its Name With Another Is Recorded By Its Description
    Add Elements
    ...                <button class="titled" aria-label="Remove" title="Remove first">Remove first</button>
    ...                <button class="titled" aria-label="Remove" title="Remove second">Remove second</button>
    ${selector} =      Record Click
    ...                css=.titled >> nth=1
    Should Be Equal
    ...                ${selector}
    ...                role=button[description="Remove second"s]
    Get Text
    ...                ${selector}
    ...                ==
    ...                Remove second

A Button Removed By Its Click Is Recorded By Its Description Seen At The Press
    Add Elements           <div id="dialog"><button aria-label="Close dialog" title="Close">Close</button></div>
    Evaluate JavaScript
    ...                    id=dialog
    ...                    (dialog) => dialog.addEventListener('click', () => dialog.remove())
    ${selector} =          Record Click
    ...                    css=[aria-label="Close dialog"]
    Should Be Equal
    ...                    ${selector}
    ...                    role=button[description="Close"s]

A Button Whose Title Differs From Its Text Keeps Its Name
    Add Elements       <button aria-label="Open menu" title="Menu">=</button>
    ${selector} =      Record Click                                              css=[aria-label="Open menu"]
    Should Be Equal    ${selector}                                               role=button[name="Open menu"s]

A Button Whose Title Is Used Twice Keeps Its Name
    Add Elements
    ...                <button aria-label="Keep draft" title="Save">Save</button>
    ...                <button aria-label="Keep copy" title="Save">Save</button>
    ${selector} =      Record Click                                                  css=[aria-label="Keep draft"]
    Should Be Equal    ${selector}                                                   role=button[name="Keep draft"s]

A Button Whose Title Is Used Again In A Shadow Root Keeps Its Name
    Add Elements           <button aria-label="Close dialog" title="Close">Close</button><div id="title-host"></div>
    Evaluate JavaScript
    ...                    id=title-host
    ...                    (host) => { host.attachShadow({mode: 'open'}).innerHTML = '<button aria-label="Close panel" title="Close">Close</button>'; }
    ${selector} =          Record Click
    ...                    css=[aria-label="Close dialog"]
    Should Be Equal
    ...                    ${selector}
    ...                    role=button[name="Close dialog"s]

A Button That Already Has A Description Keeps Its Name
    Add Elements
    ...                <span id="hint">Deletes the file</span>
    ...                <button aria-label="Delete file" title="Delete" aria-describedby="hint">Delete</button>
    ${selector} =      Record Click
    ...                css=[aria-label="Delete file"]
    Should Be Equal
    ...                ${selector}
    ...                role=button[name="Delete file"s]

Every Click Of A Recording Is Rewritten On Its Own
    Add Elements
    ...                        <button aria-label="Close dialog" title="Close">Close</button>
    ...                        <button aria-label="Open menu" title="Menu">=</button>
    ...                        <button aria-label="Open help" title="Help">Help</button>
    ${promise} =               Promise To
    ...                        Record Keyword
    ...                        Click Titled
    ...                        ${None}
    Toolbar State Should Be    recording
    Click                      css=[aria-label="Close dialog"]
    Wait Until Calls           1
    Click                      css=[aria-label="Open menu"]
    Wait Until Calls           2
    Click                      css=[aria-label="Open help"]
    Wait Until Calls           3
    ${selectors} =             Recorded Selectors
    Send Command               {cmd: 'stop'}
    Wait For                   ${promise}
    Should Be Equal
    ...                        ${selectors}
    ...                        ${{['role=button[description="Close"s]', 'role=button[name="Open menu"s]', 'role=button[description="Help"s]']}}

Record Selector Starts The Plugin And Keeps The Picked Selector
    Add Elements          <button aria-label="Close dialog" title="Close">Close</button>
    ${promise} =          Promise To
    ...                   Record Selector
    Wait For Function
    ...                   () => window.__rfbToolbarState && window.__rfbToolbarState.phase === 'picking' && document.body.getAttribute('data-pw-cursor') === 'pointer'
    ${binding} =          Evaluate JavaScript
    ...                   ${None}
    ...                   () => typeof window.__rfbRecorderSelectorsPress
    Should Be Equal
    ...                   ${binding}
    ...                   function
    Click                 css=[aria-label="Close dialog"]
    Wait For Function     () => window.__rfbToolbarState.phase === 'picked'
    Send Command          {cmd: 'use'}
    ${selector} =         Wait For
    ...                   ${promise}
    Should Not Contain
    ...                   ${selector}
    ...                   description
    Get Attribute
    ...                   ${selector}
    ...                   aria-label
    ...                   ==
    ...                   Close dialog


*** Keywords ***
Open Recorder Page In New Context
    New Context
    Open Recorder Page
