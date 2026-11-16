*** Settings ***
Documentation     The caption_scope rule of the RecorderSelectors plugin: a link whose name is
...               not unique, which Playwright scopes by the id of an ancestor, is recorded by
...               its name, scoped by the closest text before it. Text inside other links is no
...               scope.

Library    Browser    plugins=${CURDIR}/../RecorderSelectors
Resource          recorder.resource

Suite Setup       Allow Recording Headless            ${True}
Suite Teardown    Allow Recording Headless            ${False}
Test Setup        Open Page With Course Categories
Test Teardown     Run Keywords                        End Any Session                                                       AND    Close Page    ALL    AND    Wait For All Promises

Test Tags         recorder


*** Test Cases ***
A Link Scoped By An Id Is Scoped By The Category Title Above It
    ${selector} =      Record Click    css=[id="#category--12-content"] >> text=Certified Professional
    Should Be Equal
    ...                ${selector}
    ...                role=link[name="RFCP® Robot Framework® Certified Professional"s] >> scope="Robot Framework"
    Get Attribute
    ...                ${selector}
    ...                href
    ...                ==
    ...                \#rfcp

A Link After Other Links Is Scoped By The Category Title, Not By Their Text
    ${selector} =      Record Click    css=[id="#category--12-content"] >> text=Webinar
    Should Be Equal
    ...                ${selector}
    ...                role=link[name="Testautomatisierung mit Robot Framework - Webinar"s] >> scope="Robot Framework"
    Get Attribute
    ...                ${selector}
    ...                href
    ...                ==
    ...                \#webinar

A Link That Navigates Away Is Scoped By The Category Title Seen At The Click
    Evaluate JavaScript
    ...                                 css=[id="#category--12-content"] >> text=Certified Professional
    ...                                 (a) => a.setAttribute('href', '?rfcp')
    ${selector} =                       Record Click
    ...                                 css=[id="#category--12-content"] >> text=Certified Professional
    Should Be Equal
    ...                                 ${selector}
    ...                                 role=link[name="RFCP® Robot Framework® Certified Professional"s] >> scope="Robot Framework"
    Close Page
    Open Page With Course Categories
    Get Attribute
    ...                                 ${selector}
    ...                                 href
    ...                                 ==
    ...                                 \#rfcp


*** Keywords ***
Open Page With Course Categories
    Open Recorder Page
    Add Elements
    ...                   <div id="category--11"><div class="collapsible-content">
    ...                   <header><div class="container"><div class="col"><p>Highlights </p></div>
    ...                   <div class="col"><button aria-label="Zuklappen"><span></span></button></div></div></header>
    ...                   <div class="content" id="#category--11-content"><div class="container">
    ...                   <div class="col"><p class="title"><a href="\#rfcp-highlight">RFCP<sup>®</sup> Robot Framework<sup>®</sup> Certified Professional</a></p></div>
    ...                   <div class="col"><p><a href="\#rfcp-highlight">Details &amp; Termine</a></p></div></div>
    ...                   <div class="container">
    ...                   <div class="col"><p class="title"><a href="\#webinar-highlight">Testautomatisierung mit Robot Framework - Webinar</a></p></div>
    ...                   <div class="col"><p><a href="\#webinar-highlight">Details &amp; Termine</a></p></div></div></div></div></div>
    ...                   <div id="category--12"><div class="collapsible-content">
    ...                   <header><div class="container"><div class="col"><p>Robot Framework </p></div>
    ...                   <div class="col"><button aria-label="Zuklappen"><span></span></button></div></div></header>
    ...                   <div class="content" id="#category--12-content"><div class="container">
    ...                   <div class="col"><p class="title"><a href="\#rfcp">RFCP<sup>®</sup> Robot Framework<sup>®</sup> Certified Professional</a></p></div>
    ...                   <div class="col"><p><a href="\#rfcp">Details &amp; Termine</a></p></div></div>
    ...                   <div class="container">
    ...                   <div class="col"><p class="title"><a href="\#webinar">Testautomatisierung mit Robot Framework - Webinar</a></p></div>
    ...                   <div class="col"><p><a href="\#webinar">Details &amp; Termine</a></p></div></div></div></div></div>
