*** Settings ***
Documentation     The label_scope rule of the RecorderSelectors plugin: a form control without
...               an accessible name, captioned by a plain element beside it, is recorded by
...               its role, scoped by that caption. A control Playwright names is kept.

Library           Browser                            plugins=${CURDIR}/../RecorderSelectors
Resource          recorder.resource

Suite Setup       Allow Recording Headless           ${True}
Suite Teardown    Allow Recording Headless           ${False}
Test Setup        Open Page With Captioned Fields
Test Teardown     Run Keywords                       End Any Session                                                       AND    Close Page    ALL    AND    Wait For All Promises

Test Tags         recorder


*** Test Cases ***
A Selected Option Is Recorded By The Caption Above The Select
    ${selector} =      Record Select    css=#order >> select >> nth=0         express
    Should Be Equal    ${selector}      role=combobox >> scope="Shipping*"
    Get Property       ${selector}      value                                 ==         express

A Caption That Starts Like Another Caption Finds Its Own Select
    ${selector} =      Record Select    css=#order >> select >> nth=1                eu
    Should Be Equal    ${selector}      role=combobox >> scope="Shipping/Region*"
    Get Property       ${selector}      value                                        ==    eu

A Caption In The Cell Before The Select Scopes It From The Row
    ${selector} =      Record Select    css=#order >> select >> nth=2         gift
    Should Be Equal    ${selector}      role=combobox >> scope="Packaging"
    Get Property       ${selector}      value                                 ==      gift

A Select In An Iframe Is Recorded By Its Caption
    VAR    ${fields} =
    ...    <table><tbody><tr>
    ...    <td><span class="caption">Room type*</span><br><input type="hidden" name="roomKey" value="single">
    ...    <select name="roomKeyList"><option value="single" selected>Single</option><option value="double">Double</option></select></td>
    ...    <td><span class="caption">Room type/View*</span><br><input type="hidden" name="viewKey" value="sea">
    ...    <select name="viewKeyList"><option value="sea" selected>Sea</option></select></td>
    ...    </tr></tbody></table>
    ...    separator=${EMPTY}
    Evaluate JavaScript
    ...                    ${None}
    ...                    (fields) => new Promise((loaded) => { const frame = document.createElement('iframe'); frame.id = 'booking'; frame.onload = loaded; frame.srcdoc = fields; document.body.prepend(frame); })
    ...                    arg=${fields}
    ${selector} =          Record Select
    ...                    id=booking >>> select[name="roomKeyList"]
    ...                    double
    Log                    ${selector}
    Should End With
    ...                    ${selector}
    ...                    role=combobox >> scope="Room type*"
    Get Property
    ...                    ${selector}
    ...                    value
    ...                    ==
    ...                    double

A Select In A Cross-Origin Iframe Is Recorded By Its Caption
    ${url} =               Evaluate
    ...                    $PAGE_URL.replace('localhost', '127.0.0.1')
    Evaluate JavaScript
    ...                    ${None}
    ...                    (url) => new Promise((loaded) => { const frame = document.createElement('iframe'); frame.id = 'booking'; frame.onload = loaded; frame.src = url; frame.style.width = '800px'; frame.style.height = '300px'; document.body.prepend(frame); })
    ...                    arg=${url}
    VAR    ${fields} =
    ...    <table><tbody><tr>
    ...    <td><span class="caption">Room type*</span><br><input type="hidden" name="roomKey" value="single">
    ...    <select name="roomKeyList"><option value="single" selected>Single</option><option value="double">Double</option></select></td>
    ...    <td><span class="caption">Room type/View*</span><br><input type="hidden" name="viewKey" value="sea">
    ...    <select name="viewKeyList"><option value="sea" selected>Sea</option></select></td>
    ...    </tr></tbody></table>
    ...    separator=${EMPTY}
    Evaluate JavaScript
    ...                    id=booking >>> body
    ...                    (body, fields) => body.insertAdjacentHTML('afterbegin', fields)
    ...                    arg=${fields}
    ${selector} =          Record Select
    ...                    id=booking >>> select[name="roomKeyList"]
    ...                    double
    Log                    ${selector}
    Should End With
    ...                    ${selector}
    ...                    role=combobox >> scope="Room type*"
    Get Property
    ...                    ${selector}
    ...                    value
    ...                    ==
    ...                    double

A Select With A Label Keeps Its Name
    ${selector} =      Record Select    id=payment          invoice
    Should Be Equal    ${selector}      label="Payment"s


*** Keywords ***
Open Page With Captioned Fields
    Open Recorder Page
    Add Elements
    ...                   <table id="order"><tbody>
    ...                   <tr><td><span class="caption">Shipping*</span><br><input type="hidden" name="shippingKey" value="standard">
    ...                   <select name="shippingList"><option value="standard" selected>Standard</option><option value="express">Express</option></select></td>
    ...                   <td><span class="caption">Shipping/Region*</span><br><input type="hidden" name="regionKey" value="us">
    ...                   <select name="regionList"><option value="us" selected>US</option><option value="eu">EU</option></select></td></tr>
    ...                   <tr><td><b>Packaging</b></td>
    ...                   <td><select name="packagingList"><option value="box" selected>Box</option><option value="gift">Gift wrap</option></select></td></tr>
    ...                   <tr><td><label for="payment">Payment</label>
    ...                   <select id="payment"><option value="card" selected>Card</option><option value="invoice">Invoice</option></select></td></tr>
    ...                   </tbody></table>
