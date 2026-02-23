import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs

ApplicationWindow {
    id: root
    visible: true
    width: 1400
    height: 800
    minimumWidth: versionsListVisible ? 800 : 450
    minimumHeight: 750
    title: "Dailies Notes Assistant"

    color: themeManager.backgroundColor

    // Visibility states for sections
    property bool topSectionVisible: true
    property bool versionsListVisible: true

    // Keyboard shortcut for theme customizer
    Shortcut {
        sequence: "Ctrl+Shift+T"
        onActivated: {
            console.log("Theme customizer shortcut activated")
            themeCustomizer.open()
        }
    }

    // Keyboard shortcut to hide/show top section (meeting, llm, playlists)
    Shortcut {
        sequence: "Ctrl+Shift+U"
        onActivated: {
            console.log("Toggle top section - current state:", topSectionVisible)
            topSectionVisible = !topSectionVisible
            console.log("Toggle top section - new state:", topSectionVisible)
        }
    }

    // Keyboard shortcut to hide/show versions list
    Shortcut {
        sequence: "Ctrl+Shift+S"
        onActivated: {
            console.log("Toggle versions list - current state:", versionsListVisible)
            versionsListVisible = !versionsListVisible
            console.log("Toggle versions list - new state:", versionsListVisible)
        }
    }

    // Theme Manager (singleton-like object)
    QtObject {
        id: themeManager
        property color backgroundColor: "#1a1a1a"
        property color cardBackground: "#2a2a2a"
        property color accentColor: "#3b82f6"
        property color accentHover: "#2563eb"
        property color borderColor: "#404040"
        property color textColor: "#e0e0e0"
        property color mutedTextColor: "#888888"
        property color inputBackground: "#1a1a1a"
        property int borderRadius: 8
    }

    // Main layout
    ColumnLayout {
        anchors.fill: parent
        spacing: 0

        // Top Control Panel - Wrapping cards like React's Flex wrap
        Flow {
            Layout.fillWidth: true
            Layout.margins: 16
            spacing: 16
            visible: topSectionVisible

            // Join Meeting Widget
            Rectangle {
                width: Math.max(300, Math.min(400, (root.width - 48) / 3 - 16))
                height: 220
                color: themeManager.cardBackground
                radius: themeManager.borderRadius
                border.color: themeManager.borderColor
                border.width: 1

                ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 16
                        spacing: 0

                        Text {
                            text: "Meeting"
                            font.pixelSize: 16
                            font.bold: true
                            color: themeManager.textColor
                            Layout.fillWidth: true
                            Layout.bottomMargin: 12
                        }

                        TextField {
                            id: meetingIdInput
                            Layout.fillWidth: true
                            placeholderText: "Meeting ID"
                            text: backend.meetingId
                            color: themeManager.textColor
                            Layout.bottomMargin: 8

                            background: Rectangle {
                                color: themeManager.inputBackground
                                border.color: themeManager.borderColor
                                border.width: 1
                                radius: 4
                            }

                            onTextChanged: {
                                backend.meetingId = text
                            }
                        }

                        Button {
                            text: "Join Meeting"
                            Layout.fillWidth: true
                            Layout.preferredHeight: 40

                            onClicked: {
                                backend.joinMeeting()
                            }

                            background: Rectangle {
                                color: parent.enabled ? (parent.hovered ? themeManager.accentHover : themeManager.accentColor) : "#3a3a3a"
                                radius: 6
                            }

                            contentItem: Text {
                                text: parent.text
                                color: parent.enabled ? themeManager.textColor : "#555555"
                                horizontalAlignment: Text.AlignHCenter
                                verticalAlignment: Text.AlignVCenter
                                font.pixelSize: 14
                            }
                        }
                    }
                }

            // LLM Assistant Widget
            Rectangle {
                width: Math.max(300, Math.min(400, (root.width - 48) / 3 - 16))
                height: 220
                color: themeManager.cardBackground
                radius: themeManager.borderRadius
                border.color: themeManager.borderColor
                border.width: 1

                ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 16
                        spacing: 12

                        Text {
                            text: "LLM Assistant"
                            font.pixelSize: 16
                            font.bold: true
                            color: themeManager.textColor
                            Layout.fillWidth: true
                        }

                        TabBar {
                            id: llmTabBar
                            Layout.fillWidth: true

                            background: Rectangle {
                                color: "transparent"
                            }

                            Repeater {
                                model: ["OpenAI", "Claude", "Llama"]
                                TabButton {
                                    text: modelData
                                    background: Rectangle {
                                        color: llmTabBar.currentIndex === index ? themeManager.accentColor : "#3a3a3a"
                                        radius: 6
                                    }
                                    contentItem: Text {
                                        text: parent.text
                                        color: themeManager.textColor
                                        horizontalAlignment: Text.AlignHCenter
                                        verticalAlignment: Text.AlignVCenter
                                        font.pixelSize: 12
                                    }
                                }
                            }
                        }

                        StackLayout {
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            currentIndex: llmTabBar.currentIndex

                            // OpenAI Tab
                            ColumnLayout {
                                spacing: 8

                                TextField {
                                    Layout.fillWidth: true
                                    placeholderText: "API Key"
                                    text: backend.openaiApiKey
                                    color: themeManager.textColor
                                    echoMode: TextInput.Password

                                    background: Rectangle {
                                        color: themeManager.inputBackground
                                        border.color: themeManager.borderColor
                                        border.width: 1
                                        radius: 4
                                    }

                                    onTextChanged: backend.openaiApiKey = text
                                }

                                ScrollView {
                                    Layout.fillWidth: true
                                    Layout.fillHeight: true
                                    Layout.minimumHeight: 40

                                    TextArea {
                                        placeholderText: "Prompt"
                                        text: backend.openaiPrompt
                                        color: themeManager.textColor
                                        wrapMode: TextArea.Wrap

                                        background: Rectangle {
                                            color: themeManager.inputBackground
                                            border.color: themeManager.borderColor
                                            border.width: 1
                                            radius: 4
                                        }

                                        onTextChanged: backend.openaiPrompt = text
                                    }
                                }
                            }

                            // Claude Tab
                            ColumnLayout {
                                spacing: 8

                                TextField {
                                    Layout.fillWidth: true
                                    placeholderText: "API Key"
                                    text: backend.claudeApiKey
                                    color: themeManager.textColor
                                    echoMode: TextInput.Password

                                    background: Rectangle {
                                        color: themeManager.inputBackground
                                        border.color: themeManager.borderColor
                                        border.width: 1
                                        radius: 4
                                    }

                                    onTextChanged: backend.claudeApiKey = text
                                }

                                ScrollView {
                                    Layout.fillWidth: true
                                    Layout.fillHeight: true
                                    Layout.minimumHeight: 40

                                    TextArea {
                                        placeholderText: "Prompt"
                                        text: backend.claudePrompt
                                        color: themeManager.textColor
                                        wrapMode: TextArea.Wrap

                                        background: Rectangle {
                                            color: themeManager.inputBackground
                                            border.color: themeManager.borderColor
                                            border.width: 1
                                            radius: 4
                                        }

                                        onTextChanged: backend.claudePrompt = text
                                    }
                                }
                            }

                            // Llama Tab
                            ColumnLayout {
                                spacing: 8

                                TextField {
                                    Layout.fillWidth: true
                                    placeholderText: "API Key"
                                    text: backend.llamaApiKey
                                    color: themeManager.textColor
                                    echoMode: TextInput.Password

                                    background: Rectangle {
                                        color: themeManager.inputBackground
                                        border.color: themeManager.borderColor
                                        border.width: 1
                                        radius: 4
                                    }

                                    onTextChanged: backend.llamaApiKey = text
                                }

                                ScrollView {
                                    Layout.fillWidth: true
                                    Layout.fillHeight: true
                                    Layout.minimumHeight: 40

                                    TextArea {
                                        placeholderText: "Prompt"
                                        text: backend.llamaPrompt
                                        color: themeManager.textColor
                                        wrapMode: TextArea.Wrap

                                        background: Rectangle {
                                            color: themeManager.inputBackground
                                            border.color: themeManager.borderColor
                                            border.width: 1
                                            radius: 4
                                        }

                                        onTextChanged: backend.llamaPrompt = text
                                    }
                                }
                            }
                        }
                    }
                }

            // Playlists Widget
            Rectangle {
                width: Math.max(300, Math.min(400, (root.width - 48) / 3 - 16))
                height: 220
                color: themeManager.cardBackground
                radius: themeManager.borderRadius
                border.color: themeManager.borderColor
                border.width: 1

                ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 16
                        spacing: 12

                        Text {
                            text: "Playlists"
                            font.pixelSize: 16
                            font.bold: true
                            color: themeManager.textColor
                            Layout.fillWidth: true
                        }

                        TabBar {
                            id: playlistTabBar
                            Layout.fillWidth: true

                            background: Rectangle {
                                color: "transparent"
                            }

                            TabButton {
                                text: "Flow PTR Playlist"
                                background: Rectangle {
                                    color: playlistTabBar.currentIndex === 0 ? themeManager.accentColor : "#3a3a3a"
                                    radius: 6
                                }
                                contentItem: Text {
                                    text: parent.text
                                    color: themeManager.textColor
                                    horizontalAlignment: Text.AlignHCenter
                                    verticalAlignment: Text.AlignVCenter
                                    font.pixelSize: 12
                                }
                            }

                            TabButton {
                                text: "CSV Playlist"
                                background: Rectangle {
                                    color: playlistTabBar.currentIndex === 1 ? themeManager.accentColor : "#3a3a3a"
                                    radius: 6
                                }
                                contentItem: Text {
                                    text: parent.text
                                    color: themeManager.textColor
                                    horizontalAlignment: Text.AlignHCenter
                                    verticalAlignment: Text.AlignVCenter
                                    font.pixelSize: 12
                                }
                            }
                        }

                        StackLayout {
                            Layout.fillWidth: true
                            Layout.fillHeight: true
                            currentIndex: playlistTabBar.currentIndex

                            // Flow PTR Playlist Tab
                            ColumnLayout {
                                spacing: 8

                                ComboBox {
                                    Layout.fillWidth: true
                                    model: backend.shotgridProjects
                                    displayText: currentIndex >= 0 ? currentText : "Select Project"

                                    background: Rectangle {
                                        color: themeManager.inputBackground
                                        border.color: themeManager.borderColor
                                        border.width: 1
                                        radius: 4
                                    }

                                    contentItem: Text {
                                        text: parent.displayText
                                        color: themeManager.textColor
                                        verticalAlignment: Text.AlignVCenter
                                        leftPadding: 8
                                    }

                                    onCurrentIndexChanged: {
                                        if (currentIndex >= 0) {
                                            backend.selectShotgridProject(currentIndex)
                                        }
                                    }
                                }

                                ComboBox {
                                    Layout.fillWidth: true
                                    model: backend.shotgridPlaylists
                                    displayText: currentIndex >= 0 ? currentText : "Select Playlist"

                                    background: Rectangle {
                                        color: themeManager.inputBackground
                                        border.color: themeManager.borderColor
                                        border.width: 1
                                        radius: 4
                                    }

                                    contentItem: Text {
                                        text: parent.displayText
                                        color: themeManager.textColor
                                        verticalAlignment: Text.AlignVCenter
                                        leftPadding: 8
                                    }

                                    onCurrentIndexChanged: {
                                        if (currentIndex >= 0) {
                                            backend.selectShotgridPlaylist(currentIndex)
                                        }
                                    }
                                }

                                Button {
                                    text: "Load Playlist"
                                    Layout.fillWidth: true
                                    enabled: backend.shotgridPlaylists.length > 0

                                    onClicked: {
                                        backend.loadShotgridPlaylist()
                                    }

                                    background: Rectangle {
                                        color: parent.enabled ? (parent.hovered ? themeManager.accentHover : themeManager.accentColor) : "#3a3a3a"
                                        radius: 6
                                    }

                                    contentItem: Text {
                                        text: parent.text
                                        color: parent.enabled ? themeManager.textColor : "#555555"
                                        horizontalAlignment: Text.AlignHCenter
                                        verticalAlignment: Text.AlignVCenter
                                        font.pixelSize: 12
                                    }
                                }
                            }

                            // CSV Playlist Tab
                            ColumnLayout {
                                spacing: 8

                                Text {
                                    text: "Upload a CSV file with version names in the first column (header row will be skipped)"
                                    font.pixelSize: 11
                                    color: themeManager.mutedTextColor
                                    wrapMode: Text.WordWrap
                                    Layout.fillWidth: true
                                }

                                Button {
                                    text: "Import CSV"
                                    Layout.fillWidth: true

                                    onClicked: {
                                        csvImportDialog.open()
                                    }

                                    background: Rectangle {
                                        color: parent.enabled ? (parent.hovered ? themeManager.accentHover : themeManager.accentColor) : "#3a3a3a"
                                        radius: 6
                                    }

                                    contentItem: Text {
                                        text: parent.text
                                        color: parent.enabled ? themeManager.textColor : "#555555"
                                        horizontalAlignment: Text.AlignHCenter
                                        verticalAlignment: Text.AlignVCenter
                                        font.pixelSize: 12
                                    }
                                }

                                Button {
                                    text: "Export CSV"
                                    Layout.fillWidth: true

                                    onClicked: {
                                        csvExportDialog.open()
                                    }

                                    background: Rectangle {
                                        color: parent.enabled ? (parent.hovered ? themeManager.accentHover : themeManager.accentColor) : "#3a3a3a"
                                        radius: 6
                                    }

                                    contentItem: Text {
                                        text: parent.text
                                        color: parent.enabled ? themeManager.textColor : "#555555"
                                        horizontalAlignment: Text.AlignHCenter
                                        verticalAlignment: Text.AlignVCenter
                                        font.pixelSize: 12
                                    }
                                }
                            }
                        }
                    }
                }
        }

        // Main Content Area
        RowLayout {
            Layout.fillWidth: true
            Layout.fillHeight: true
            Layout.margins: 16
            spacing: 16

            // Left sidebar - Version list
            Rectangle {
                Layout.preferredWidth: 320
                Layout.minimumWidth: 250
                Layout.fillHeight: true
                color: themeManager.cardBackground
                radius: themeManager.borderRadius
                border.color: themeManager.borderColor
                border.width: 1
                visible: versionsListVisible

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 16
                    spacing: 12

                    Text {
                        text: "Versions"
                        font.pixelSize: 20
                        font.bold: true
                        color: themeManager.textColor
                        Layout.fillWidth: true
                    }

                    ListView {
                        id: versionListView
                        Layout.fillWidth: true
                        Layout.fillHeight: true

                        model: versionModel
                        spacing: 8
                        clip: true

                        delegate: ItemDelegate {
                            width: versionListView.width - 16  // Reserve space for scrollbar

                            background: Rectangle {
                                color: versionListView.currentIndex === index ? themeManager.accentColor : "#3a3a3a"
                                radius: 6
                                border.color: "#505050"
                                border.width: 1
                            }

                            contentItem: Text {
                                text: model.description || "Version " + model.versionId
                                color: themeManager.textColor
                                font.pixelSize: 14
                                wrapMode: Text.WordWrap
                                padding: 10
                                rightPadding: 12  // Extra padding on right side
                            }

                            onClicked: {
                                versionListView.currentIndex = index
                                backend.selectVersion(model.versionId)
                            }
                        }

                        ScrollBar.vertical: ScrollBar {
                            policy: ScrollBar.AsNeeded
                        }
                    }
                }
            }

            // Right side - Version details
            Rectangle {
                Layout.fillWidth: true
                Layout.minimumWidth: 400
                Layout.fillHeight: true
                color: themeManager.cardBackground
                radius: themeManager.borderRadius
                border.color: themeManager.borderColor
                border.width: 1

                ColumnLayout {
                    anchors.fill: parent
                    anchors.margins: 16
                    spacing: 16

                    // Header
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 16

                        ColumnLayout {
                            Layout.fillWidth: true
                            spacing: 4

                            Text {
                                text: backend.selectedVersionName || "No version selected"
                                font.pixelSize: 18
                                font.bold: true
                                color: themeManager.textColor
                            }

                            Text {
                                text: backend.selectedVersionId && backend.selectedVersionId !== "" ? "Version ID: " + backend.selectedVersionId : ""
                                font.pixelSize: 12
                                color: themeManager.mutedTextColor
                                visible: backend.selectedVersionId && backend.selectedVersionId !== ""
                            }
                        }
                    }

                    // Tabs
                    TabBar {
                        id: tabBar
                        Layout.fillWidth: true

                        background: Rectangle {
                            color: "transparent"
                        }

                        TabButton {
                            text: "User Notes"
                            background: Rectangle {
                                color: tabBar.currentIndex === 0 ? themeManager.accentColor : "#3a3a3a"
                                radius: 6
                            }
                            contentItem: Text {
                                text: parent.text
                                color: themeManager.textColor
                                horizontalAlignment: Text.AlignHCenter
                                verticalAlignment: Text.AlignVCenter
                            }
                        }

                        TabButton {
                            text: "Transcript"
                            background: Rectangle {
                                color: tabBar.currentIndex === 1 ? themeManager.accentColor : "#3a3a3a"
                                radius: 6
                            }
                            contentItem: Text {
                                text: parent.text
                                color: themeManager.textColor
                                horizontalAlignment: Text.AlignHCenter
                                verticalAlignment: Text.AlignVCenter
                            }
                        }
                    }

                    // Split view with tab content and staging area
                    SplitView {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        Layout.minimumHeight: 200
                        orientation: Qt.Vertical

                        // Top section - tab content (User Notes or Transcript)
                        StackLayout {
                            SplitView.fillHeight: true
                            SplitView.minimumHeight: 100
                            currentIndex: tabBar.currentIndex

                            // User Notes tab - Sent notes display
                            ScrollView {
                                TextArea {
                                    id: sentNotesArea
                                    text: backend.currentNotes
                                    readOnly: true
                                    wrapMode: TextArea.Wrap
                                    color: themeManager.textColor
                                    placeholderText: "Sent notes will appear here..."

                                    background: Rectangle {
                                        color: themeManager.inputBackground
                                        border.color: themeManager.borderColor
                                        border.width: 1
                                        radius: 6
                                    }
                                }
                            }

                            // Transcript tab
                            ScrollView {
                                TextArea {
                                    text: backend.currentTranscript
                                    readOnly: true
                                    wrapMode: TextArea.Wrap
                                    color: themeManager.textColor
                                    placeholderText: "Transcript will appear here as it's received..."

                                    background: Rectangle {
                                        color: themeManager.inputBackground
                                        border.color: themeManager.borderColor
                                        border.width: 1
                                        radius: 6
                                    }
                                }
                            }
                        }

                        // AI Notes sliver - in the middle
                        Rectangle {
                            SplitView.fillWidth: true
                            SplitView.preferredHeight: 50
                            SplitView.minimumHeight: 50
                            SplitView.maximumHeight: 50
                            color: themeManager.cardBackground
                            border.color: themeManager.borderColor
                            border.width: 1
                            radius: 6

                            RowLayout {
                                anchors.fill: parent
                                anchors.margins: 12
                                spacing: 8

                                Text {
                                    Layout.fillWidth: true
                                    text: backend.currentAiNotes || "No AI notes generated yet"
                                    color: backend.currentAiNotes ? themeManager.textColor : themeManager.mutedTextColor
                                    elide: Text.ElideRight
                                    font.pixelSize: 12
                                }

                                Button {
                                    text: "↻"
                                    onClicked: backend.generateNotes()

                                    background: Rectangle {
                                        color: parent.hovered ? "#3a3a3a" : themeManager.cardBackground
                                        radius: 4
                                    }

                                    contentItem: Text {
                                        text: parent.text
                                        color: themeManager.textColor
                                        horizontalAlignment: Text.AlignHCenter
                                        verticalAlignment: Text.AlignVCenter
                                    }
                                }

                                Button {
                                    text: "Add"
                                    enabled: backend.currentAiNotes !== ""
                                    onClicked: backend.addAiNotesToStaging()

                                    background: Rectangle {
                                        color: parent.hovered ? "#3a3a3a" : themeManager.cardBackground
                                        radius: 4
                                    }

                                    contentItem: Text {
                                        text: parent.text
                                        color: parent.enabled ? themeManager.textColor : "#555555"
                                        horizontalAlignment: Text.AlignHCenter
                                        verticalAlignment: Text.AlignVCenter
                                    }
                                }
                            }
                        }

                        // Staging area with overlay send button - always visible at bottom
                        Item {
                            SplitView.fillHeight: true
                            SplitView.minimumHeight: 80
                            SplitView.preferredHeight: 120

                            ScrollView {
                                anchors.fill: parent

                                TextArea {
                                    id: stagingArea
                                    text: backend.stagingNote
                                    wrapMode: TextArea.Wrap
                                    color: themeManager.textColor
                                    placeholderText: "Type your note here..."
                                    rightPadding: 80  // Make room for the button

                                    onTextChanged: {
                                        backend.stagingNote = text
                                    }

                                    background: Rectangle {
                                        color: themeManager.inputBackground
                                        border.color: themeManager.borderColor
                                        border.width: 1
                                        radius: 6
                                    }
                                }
                            }

                            // Send button overlaid in bottom-right corner
                            Button {
                                text: "Send"
                                enabled: backend.stagingNote.trim() !== ""
                                anchors.right: parent.right
                                anchors.bottom: parent.bottom
                                anchors.margins: 8
                                width: 70
                                height: 32

                                onClicked: {
                                    // Save note to the currently selected version
                                    backend.saveNoteToVersion(backend.stagingNote)

                                    // Clear staging area
                                    stagingArea.text = ""
                                }

                                background: Rectangle {
                                    color: parent.enabled ? (parent.hovered ? themeManager.accentHover : themeManager.accentColor) : "#3a3a3a"
                                    radius: 6
                                }

                                contentItem: Text {
                                    text: parent.text
                                    color: parent.enabled ? themeManager.textColor : "#555555"
                                    horizontalAlignment: Text.AlignHCenter
                                    verticalAlignment: Text.AlignVCenter
                                    font.pixelSize: 14
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Theme Customizer Dialog
    Dialog {
        id: themeCustomizer
        modal: true
        anchors.centerIn: parent
        width: 500
        height: 600
        title: "Theme Customizer"

        background: Rectangle {
            color: themeManager.cardBackground
            border.color: themeManager.borderColor
            border.width: 1
            radius: 8
        }

        ColumnLayout {
            anchors.fill: parent
            spacing: 20

            Text {
                text: "Customize Theme Colors"
                font.pixelSize: 18
                font.bold: true
                color: themeManager.textColor
                Layout.fillWidth: true
            }

            ScrollView {
                Layout.fillWidth: true
                Layout.fillHeight: true

                ColumnLayout {
                    width: parent.width
                    spacing: 16

                    // Background Color
                    ThemeColorPicker {
                        title: "Background Color"
                        currentColor: themeManager.backgroundColor
                        onColorChanged: function(color) {
                            themeManager.backgroundColor = color
                        }
                    }

                    // Card Background
                    ThemeColorPicker {
                        title: "Card Background"
                        currentColor: themeManager.cardBackground
                        onColorChanged: function(color) {
                            themeManager.cardBackground = color
                        }
                    }

                    // Accent Color
                    ThemeColorPicker {
                        title: "Accent Color"
                        currentColor: themeManager.accentColor
                        onColorChanged: function(color) {
                            themeManager.accentColor = color
                        }
                    }

                    // Accent Hover
                    ThemeColorPicker {
                        title: "Accent Hover"
                        currentColor: themeManager.accentHover
                        onColorChanged: function(color) {
                            themeManager.accentHover = color
                        }
                    }

                    // Border Color
                    ThemeColorPicker {
                        title: "Border Color"
                        currentColor: themeManager.borderColor
                        onColorChanged: function(color) {
                            themeManager.borderColor = color
                        }
                    }

                    // Text Color
                    ThemeColorPicker {
                        title: "Text Color"
                        currentColor: themeManager.textColor
                        onColorChanged: function(color) {
                            themeManager.textColor = color
                        }
                    }

                    // Muted Text Color
                    ThemeColorPicker {
                        title: "Muted Text Color"
                        currentColor: themeManager.mutedTextColor
                        onColorChanged: function(color) {
                            themeManager.mutedTextColor = color
                        }
                    }

                    // Border Radius
                    RowLayout {
                        Layout.fillWidth: true
                        spacing: 12

                        Text {
                            text: "Border Radius:"
                            color: themeManager.textColor
                            font.pixelSize: 14
                            Layout.preferredWidth: 150
                        }

                        Slider {
                            Layout.fillWidth: true
                            from: 0
                            to: 20
                            value: themeManager.borderRadius
                            stepSize: 1

                            onValueChanged: {
                                themeManager.borderRadius = value
                            }
                        }

                        Text {
                            text: themeManager.borderRadius + "px"
                            color: themeManager.textColor
                            font.pixelSize: 14
                            Layout.preferredWidth: 50
                        }
                    }
                }
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 12

                Button {
                    text: "Reset to Default"
                    Layout.fillWidth: true

                    onClicked: {
                        themeManager.backgroundColor = "#1a1a1a"
                        themeManager.cardBackground = "#2a2a2a"
                        themeManager.accentColor = "#0d7377"
                        themeManager.accentHover = "#0e8a8f"
                        themeManager.borderColor = "#404040"
                        themeManager.textColor = "#e0e0e0"
                        themeManager.mutedTextColor = "#888888"
                        themeManager.borderRadius = 8
                    }

                    background: Rectangle {
                        color: parent.hovered ? "#3a3a3a" : themeManager.cardBackground
                        radius: 6
                        border.color: themeManager.borderColor
                        border.width: 1
                    }

                    contentItem: Text {
                        text: parent.text
                        color: themeManager.textColor
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                        font.pixelSize: 14
                    }
                }

                Button {
                    text: "Close"
                    Layout.fillWidth: true

                    onClicked: {
                        themeCustomizer.close()
                    }

                    background: Rectangle {
                        color: parent.hovered ? themeManager.accentHover : themeManager.accentColor
                        radius: 6
                    }

                    contentItem: Text {
                        text: parent.text
                        color: themeManager.textColor
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                        font.pixelSize: 14
                    }
                }
            }
        }
    }

    // CSV Import Dialog
    FileDialog {
        id: csvImportDialog
        title: "Import CSV Playlist"
        nameFilters: ["CSV files (*.csv)", "All files (*)"]
        fileMode: FileDialog.OpenFile
        onAccepted: {
            backend.importCSV(selectedFile)
        }
    }

    // CSV Export Dialog
    FileDialog {
        id: csvExportDialog
        title: "Export Notes to CSV"
        nameFilters: ["CSV files (*.csv)"]
        fileMode: FileDialog.SaveFile
        defaultSuffix: "csv"
        onAccepted: {
            backend.exportCSV(selectedFile)
        }
    }

    // Theme Color Picker Component
    component ThemeColorPicker: RowLayout {
        property string title: ""
        property color currentColor: "#000000"
        signal colorChanged(color newColor)

        Layout.fillWidth: true
        spacing: 12

        Text {
            text: title + ":"
            color: themeManager.textColor
            font.pixelSize: 14
            Layout.preferredWidth: 150
        }

        Rectangle {
            Layout.preferredWidth: 40
            Layout.preferredHeight: 40
            color: currentColor
            radius: 6
            border.color: themeManager.borderColor
            border.width: 1

            MouseArea {
                anchors.fill: parent
                onClicked: {
                    colorDialog.currentColor = currentColor
                    colorDialog.targetPicker = parent.parent
                    colorDialog.open()
                }
            }
        }

        TextField {
            Layout.fillWidth: true
            text: currentColor
            color: themeManager.textColor

            background: Rectangle {
                color: themeManager.inputBackground
                border.color: themeManager.borderColor
                border.width: 1
                radius: 4
            }

            onTextChanged: {
                if (text.match(/^#[0-9A-Fa-f]{6}$/)) {
                    colorChanged(text)
                }
            }
        }
    }

    // Color Picker Dialog
    Dialog {
        id: colorDialog
        modal: true
        anchors.centerIn: parent
        width: 400
        height: 500
        title: "Pick a Color"

        property color currentColor: "#000000"
        property var targetPicker: null

        background: Rectangle {
            color: themeManager.cardBackground
            border.color: themeManager.borderColor
            border.width: 1
            radius: 8
        }

        ColumnLayout {
            anchors.fill: parent
            spacing: 16

            // Color preview
            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 80
                color: colorDialog.currentColor
                radius: 6
                border.color: themeManager.borderColor
                border.width: 1
            }

            // Preset colors
            GridLayout {
                Layout.fillWidth: true
                columns: 6
                rowSpacing: 8
                columnSpacing: 8

                Repeater {
                    model: [
                        "#1a1a1a", "#2a2a2a", "#3a3a3a", "#404040", "#505050", "#606060",
                        "#0d7377", "#14919b", "#32b5a8", "#6dc9c1", "#a8ddd8", "#e0f7f6",
                        "#d32f2f", "#f57c00", "#fbc02d", "#388e3c", "#1976d2", "#7b1fa2",
                        "#e0e0e0", "#c0c0c0", "#a0a0a0", "#888888", "#606060", "#404040"
                    ]

                    Rectangle {
                        Layout.preferredWidth: 50
                        Layout.preferredHeight: 50
                        color: modelData
                        radius: 6
                        border.color: themeManager.borderColor
                        border.width: 1

                        MouseArea {
                            anchors.fill: parent
                            onClicked: {
                                colorDialog.currentColor = modelData
                            }
                        }
                    }
                }
            }

            // Hex input
            RowLayout {
                Layout.fillWidth: true
                spacing: 8

                Text {
                    text: "Hex:"
                    color: themeManager.textColor
                    font.pixelSize: 14
                }

                TextField {
                    Layout.fillWidth: true
                    text: colorDialog.currentColor
                    color: themeManager.textColor

                    background: Rectangle {
                        color: themeManager.inputBackground
                        border.color: themeManager.borderColor
                        border.width: 1
                        radius: 4
                    }

                    onTextChanged: {
                        if (text.match(/^#[0-9A-Fa-f]{6}$/)) {
                            colorDialog.currentColor = text
                        }
                    }
                }
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 12

                Button {
                    text: "Cancel"
                    Layout.fillWidth: true

                    onClicked: {
                        colorDialog.close()
                    }

                    background: Rectangle {
                        color: parent.hovered ? "#3a3a3a" : themeManager.cardBackground
                        radius: 6
                        border.color: themeManager.borderColor
                        border.width: 1
                    }

                    contentItem: Text {
                        text: parent.text
                        color: themeManager.textColor
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                        font.pixelSize: 14
                    }
                }

                Button {
                    text: "Apply"
                    Layout.fillWidth: true

                    onClicked: {
                        if (colorDialog.targetPicker) {
                            colorDialog.targetPicker.colorChanged(colorDialog.currentColor)
                        }
                        colorDialog.close()
                    }

                    background: Rectangle {
                        color: parent.hovered ? themeManager.accentHover : themeManager.accentColor
                        radius: 6
                    }

                    contentItem: Text {
                        text: parent.text
                        color: themeManager.textColor
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                        font.pixelSize: 14
                    }
                }
            }
        }
    }
}
