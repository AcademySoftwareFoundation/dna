import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs

ApplicationWindow {
    id: root
    visible: true
    width: 1400
    height: 800
    minimumWidth: {
        // If upper widgets are visible, minimum is 1100
        if (topSectionVisible) return 1100
        // If only sidebar and notes, minimum is 770
        if (versionsListVisible) return 770
        // If only notes section, minimum is 450
        return 450
    }
    minimumHeight: 750
    title: "Dailies Notes Assistant"

    color: themeManager.backgroundColor

    // Visibility states for sections
    property bool topSectionVisible: true
    property bool versionsListVisible: true
    property int versionListWidth: 320

    // Remember window dimensions before auto-expansion
    property int savedWidth: 0

    // Handle sync completion signal
    Connections {
        target: backend
        function onSyncCompleted(synced, skipped, failed, attachments, statusesUpdated) {
            syncCompleteDialog.syncedCount = synced
            syncCompleteDialog.skippedCount = skipped
            syncCompleteDialog.failedCount = failed
            syncCompleteDialog.attachmentsCount = attachments
            syncCompleteDialog.statusesUpdated = statusesUpdated
            syncCompleteDialog.open()
        }
    }
    property int savedX: 0
    property bool wasSidebarExpanded: false

    // Keyboard shortcut for theme customizer
    Shortcut {
        sequence: "Ctrl+Shift+T"
        context: Qt.ApplicationShortcut
        onActivated: {
            if (themeCustomizer.opened) {
                themeCustomizer.close()
            } else {
                themeCustomizer.open()
            }
        }
    }

    // Keyboard shortcut for preferences
    Shortcut {
        sequence: "Ctrl+Shift+P"
        context: Qt.ApplicationShortcut
        onActivated: {
            preferencesDialog.visible = !preferencesDialog.visible
        }
    }

    // Keyboard shortcut to hide/show top section (meeting, llm, playlists)
    Shortcut {
        sequence: "Ctrl+Shift+U"
        onActivated: {
            if (!topSectionVisible) {
                // Showing upper widgets - check if window needs expansion
                if (root.width < 1100) {
                    // Save current dimensions
                    savedWidth = root.width
                    savedX = root.x

                    // Expand from center
                    var widthDiff = 1100 - root.width
                    root.x = root.x - Math.floor(widthDiff / 2)
                    root.width = 1100
                }
            } else {
                // Hiding upper widgets - restore saved dimensions if they exist
                if (savedWidth > 0 && savedWidth < 1100) {
                    root.width = savedWidth
                    root.x = savedX
                    savedWidth = 0
                }
            }

            topSectionVisible = !topSectionVisible
        }
    }

    // Keyboard shortcut to hide/show versions list
    Shortcut {
        sequence: "Ctrl+Shift+S"
        onActivated: {

            // If showing the versions list, expand window to the left
            if (!versionsListVisible) {
                root.x = root.x - versionListWidth
                root.width = root.width + versionListWidth
            } else {
                // If hiding, shrink window from the left (move x right, decrease width)
                // But don't shrink below the minimum width needed
                var newWidth = root.width - versionListWidth
                var minRequired = topSectionVisible ? 1100 : 450

                if (newWidth >= minRequired) {
                    root.x = root.x + versionListWidth
                    root.width = newWidth
                } else {
                    // Don't shrink, just reposition to keep centered
                    var shrinkAmount = root.width - minRequired
                    root.x = root.x + shrinkAmount
                    root.width = minRequired
                }
            }

            versionsListVisible = !versionsListVisible
        }
    }

    // Keyboard shortcut to go to next version
    Shortcut {
        sequence: "Ctrl+Shift+Down"
        context: Qt.ApplicationShortcut
        onActivated: {
            if (versionListView && versionListView.currentIndex < versionListView.count - 1) {
                versionListView.currentIndex++
                var item = versionListView.currentItem
                if (item) {
                    item.clicked()
                }
            }
        }
    }

    // Keyboard shortcut to go to previous version
    Shortcut {
        sequence: "Ctrl+Shift+Up"
        context: Qt.ApplicationShortcut
        onActivated: {
            if (versionListView && versionListView.currentIndex > 0) {
                versionListView.currentIndex--
                var item = versionListView.currentItem
                if (item) {
                    item.clicked()
                }
            }
        }
    }

    // Keyboard shortcut to add AI notes to notes
    Shortcut {
        sequence: "Ctrl+Shift+A"
        context: Qt.ApplicationShortcut
        onActivated: {
            var textToAdd = aiNotesArea.text || aiNotesArea.placeholderText
            backend.addAiNotesText(textToAdd)
        }
    }

    // Keyboard shortcut to regenerate AI notes
    Shortcut {
        sequence: "Ctrl+Shift+R"
        context: Qt.ApplicationShortcut
        onActivated: {
            // Check if any LLM API key is set
            if (!backend.openaiApiKey && !backend.claudeApiKey && !backend.geminiApiKey) {
                warningDialog.warningMessage = "Please add an LLM API key in Preferences (Ctrl+Shift+P) to use AI note generation."
                warningDialog.open()
            } else {
                backend.generateNotes()
            }
        }
    }

    // Keyboard shortcut to toggle between Notes and Transcript
    Shortcut {
        sequence: "Ctrl+Shift+D"
        context: Qt.ApplicationShortcut
        onActivated: {
            if (tabBar) {
                tabBar.currentIndex = (tabBar.currentIndex === 0) ? 1 : 0
            }
        }
    }

    // Keyboard shortcut to toggle Markdown preview mode
    Shortcut {
        sequence: "Ctrl+Shift+M"
        context: Qt.ApplicationShortcut
        onActivated: {
            if (notesEntryContainer) {
                notesEntryContainer.markdownPreview = !notesEntryContainer.markdownPreview
            }
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

    // Menu Bar
    menuBar: MenuBar {
        Menu {
            title: "File"

            MenuItem {
                text: "Import CSV..."
                onTriggered: csvImportDialog.open()
            }

            MenuItem {
                text: "Export CSV..."
                onTriggered: csvExportDialog.open()
            }

            MenuSeparator {}

            MenuItem {
                text: "Reset Workspace"
                onTriggered: resetWorkspaceDialog.open()
            }

            MenuSeparator {}

            MenuItem {
                text: "Exit"
                onTriggered: Qt.quit()
            }
        }

        Menu {
            title: "View"

            MenuItem {
                text: topSectionVisible ? "Hide Upper Widgets" : "Show Upper Widgets"
                onTriggered: {
                    if (!topSectionVisible) {
                        // Showing upper widgets - check if window needs expansion
                        if (root.width < 1100) {
                            // Save current dimensions
                            savedWidth = root.width
                            savedX = root.x

                            // Expand from center
                            var widthDiff = 1100 - root.width
                            root.x = root.x - Math.floor(widthDiff / 2)
                            root.width = 1100
                        }
                    } else {
                        // Hiding upper widgets - restore saved dimensions if they exist
                        if (savedWidth > 0 && savedWidth < 1100) {
                            root.width = savedWidth
                            root.x = savedX
                            savedWidth = 0
                        }
                    }

                    topSectionVisible = !topSectionVisible
                }
            }

            MenuItem {
                text: versionsListVisible ? "Hide Versions List" : "Show Versions List"
                onTriggered: {
                    if (!versionsListVisible) {
                        root.x = root.x - versionListWidth
                        root.width = root.width + versionListWidth
                    } else {
                        // If hiding, shrink window from the left (move x right, decrease width)
                        // But don't shrink below the minimum width needed
                        var newWidth = root.width - versionListWidth
                        var minRequired = topSectionVisible ? 1100 : 450

                        if (newWidth >= minRequired) {
                            root.x = root.x + versionListWidth
                            root.width = newWidth
                        } else {
                            // Don't shrink, just reposition to keep centered
                            var shrinkAmount = root.width - minRequired
                            root.x = root.x + shrinkAmount
                            root.width = minRequired
                        }
                    }
                    versionsListVisible = !versionsListVisible
                }
            }

            MenuSeparator {}

            MenuItem {
                text: "Theme Customizer..."
                onTriggered: themeCustomizer.open()
            }
        }

        Menu {
            title: "Help"

            MenuItem {
                text: "About"
                onTriggered: aboutDialog.open()
            }

            MenuItem {
                text: "Preferences..."
                onTriggered: preferencesDialog.open()
            }
        }
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
                height: 240
                color: themeManager.cardBackground
                radius: themeManager.borderRadius
                border.color: themeManager.borderColor
                border.width: 1

                ColumnLayout {
                        anchors.fill: parent
                        anchors.margins: 16
                        spacing: 8

                        Text {
                            text: "Meeting"
                            font.pixelSize: 16
                            font.bold: true
                            color: themeManager.textColor
                            Layout.fillWidth: true
                        }

                        TextField {
                            id: meetingIdInput
                            Layout.fillWidth: true
                            placeholderText: "Meeting URL or ID"
                            text: backend.meetingId
                            color: themeManager.textColor

                            background: Rectangle {
                                color: themeManager.inputBackground
                                border.color: themeManager.borderColor
                                border.width: 1
                                radius: 4
                            }

                            onTextChanged: (newText) => {
                                backend.meetingId = text
                            }
                        }

                        // Status indicator with play/pause controls
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 8

                            Text {
                                text: {
                                    if (backend.meetingStatus === "connecting") return "● Connecting..."
                                    if (backend.meetingStatus === "joining") return "● Joining..."
                                    if (backend.meetingStatus === "connected") return "● Connected"
                                    if (backend.meetingStatus === "error") return "● Error"
                                    return "○ Disconnected"
                                }
                                font.pixelSize: 12
                                color: {
                                    if (backend.meetingStatus === "connecting") return "#fbc02d"
                                    if (backend.meetingStatus === "joining") return "#fbc02d"
                                    if (backend.meetingStatus === "connected") return "#388e3c"
                                    if (backend.meetingStatus === "error") return "#d32f2f"
                                    return themeManager.mutedTextColor
                                }
                                Layout.fillWidth: true
                            }

                            // Play/Pause button for transcript
                            Button {
                                id: transcriptToggleButton
                                Layout.preferredHeight: 32
                                enabled: backend.meetingStatus === "connected" && backend.meetingActive

                                property bool isPaused: false

                                text: isPaused ? "▶ Play Transcript" : "|| Pause Transcript"
                                font.pixelSize: 12

                                onClicked: {
                                    if (isPaused) {
                                        backend.playTranscript()
                                        isPaused = false
                                    } else {
                                        backend.pauseTranscript()
                                        isPaused = true
                                    }
                                }

                                background: Rectangle {
                                    // Yellow when playing, green when paused
                                    color: {
                                        if (!parent.enabled) return "#3a3a3a"
                                        if (parent.isPaused) {
                                            return parent.hovered ? "#28a745" : "#4caf50"  // Green
                                        } else {
                                            return parent.hovered ? "#d4a500" : "#ffc107"  // Yellow
                                        }
                                    }
                                    radius: 4
                                }

                                contentItem: Text {
                                    text: parent.text
                                    color: parent.enabled ? "#ffffff" : "#555555"
                                    horizontalAlignment: Text.AlignHCenter
                                    verticalAlignment: Text.AlignVCenter
                                    font.pixelSize: parent.font.pixelSize
                                    leftPadding: 8
                                    rightPadding: 8
                                }
                            }
                        }

                        Button {
                            text: backend.meetingActive ? "Leave Meeting" : "Join Meeting"
                            Layout.fillWidth: true
                            Layout.preferredHeight: 40
                            enabled: backend.meetingStatus !== "connecting" && backend.meetingStatus !== "joining"

                            onClicked: {
                                if (backend.meetingActive) {
                                    backend.leaveMeeting()
                                } else {
                                    // Check if Vexa API key is set
                                    if (!backend.vexaApiKey) {
                                        warningDialog.warningMessage = "Please add your Vexa API key in Preferences (Ctrl+Shift+P) to join meetings."
                                        warningDialog.open()
                                    } else {
                                        backend.joinMeeting()
                                    }
                                }
                            }

                            background: Rectangle {
                                color: {
                                    if (!parent.enabled) return "#3a3a3a"
                                    if (backend.meetingActive) {
                                        return parent.hovered ? "#d32f2f" : "#f44336"
                                    }
                                    return parent.hovered ? themeManager.accentHover : themeManager.accentColor
                                }
                                radius: 6
                            }

                            contentItem: Text {
                                text: parent.text
                                color: parent.enabled ? "#ffffff" : "#555555"
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
                height: 240
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
                                model: ["OpenAI", "Claude", "Gemini"]
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

                                ScrollView {
                                    Layout.fillWidth: true
                                    Layout.fillHeight: true
                                    Layout.minimumHeight: 40

                                    TextArea {
                                        placeholderText: "Prompt"
                                        text: backend.openaiPrompt
                                        color: themeManager.textColor
                                        wrapMode: TextArea.Wrap

                                        Keys.onPressed: function(event) {
                                            if (event.modifiers === (Qt.ControlModifier | Qt.ShiftModifier)) {
                                                if (event.key === Qt.Key_Up || event.key === Qt.Key_Down ||
                                                    event.key === Qt.Key_A || event.key === Qt.Key_R || event.key === Qt.Key_F) {
                                                    event.accepted = false
                                                }
                                            }
                                        }

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

                                ScrollView {
                                    Layout.fillWidth: true
                                    Layout.fillHeight: true
                                    Layout.minimumHeight: 40

                                    TextArea {
                                        placeholderText: "Prompt"
                                        text: backend.claudePrompt
                                        color: themeManager.textColor
                                        wrapMode: TextArea.Wrap

                                        Keys.onPressed: function(event) {
                                            if (event.modifiers === (Qt.ControlModifier | Qt.ShiftModifier)) {
                                                if (event.key === Qt.Key_Up || event.key === Qt.Key_Down ||
                                                    event.key === Qt.Key_A || event.key === Qt.Key_R || event.key === Qt.Key_F) {
                                                    event.accepted = false
                                                }
                                            }
                                        }

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

                            // Gemini Tab
                            ColumnLayout {
                                spacing: 8

                                ScrollView {
                                    Layout.fillWidth: true
                                    Layout.fillHeight: true
                                    Layout.minimumHeight: 40

                                    TextArea {
                                        placeholderText: "Prompt"
                                        text: backend.geminiPrompt
                                        color: themeManager.textColor
                                        wrapMode: TextArea.Wrap

                                        Keys.onPressed: function(event) {
                                            if (event.modifiers === (Qt.ControlModifier | Qt.ShiftModifier)) {
                                                if (event.key === Qt.Key_Up || event.key === Qt.Key_Down ||
                                                    event.key === Qt.Key_A || event.key === Qt.Key_R || event.key === Qt.Key_F) {
                                                    event.accepted = false
                                                }
                                            }
                                        }

                                        background: Rectangle {
                                            color: themeManager.inputBackground
                                            border.color: themeManager.borderColor
                                            border.width: 1
                                            radius: 4
                                        }

                                        onTextChanged: backend.geminiPrompt = text
                                    }
                                }
                            }
                        }
                    }
                }

            // Playlists Widget
            Rectangle {
                width: Math.max(300, Math.min(400, (root.width - 48) / 3 - 16))
                height: 240
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

                            property int pendingIndex: -1

                            onCurrentIndexChanged: {
                                // Check if switching to CSV tab (index 1) with ShotGrid versions loaded
                                if (currentIndex === 1 && backend.hasShotGridVersions && versionModel.rowCount() > 0) {
                                    // Store the pending index and revert to Flow PTR tab
                                    pendingIndex = 1
                                    currentIndex = 0
                                    // Show warning dialog
                                    switchToCsvWarningDialog.open()
                                }
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

                                    onPressedChanged: {
                                        if (pressed) {
                                            // Check if ShotGrid credentials are set
                                            if (!backend.shotgridUrl || !backend.shotgridApiKey || !backend.shotgridScriptName) {
                                                warningDialog.warningMessage = "Please add complete ShotGrid integration information in Preferences (Ctrl+Shift+P)."
                                                warningDialog.open()
                                            } else if (backend.shotgridProjects.length === 0) {
                                                backend.loadShotGridProjects()
                                            }
                                        }
                                    }

                                    onCurrentIndexChanged: {
                                        if (currentIndex >= 0) {
                                            backend.selectShotgridProject(currentIndex)
                                        }
                                    }
                                }

                                ComboBox {
                                    id: playlistComboBox
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

                                    onPressedChanged: {
                                        if (pressed) {
                                            // Check if ShotGrid credentials are set
                                            if (!backend.shotgridUrl || !backend.shotgridApiKey || !backend.shotgridScriptName) {
                                                warningDialog.warningMessage = "Please add complete ShotGrid integration information in Preferences (Ctrl+Shift+P)."
                                                warningDialog.open()
                                            }
                                        }
                                    }

                                    onCurrentIndexChanged: {
                                        if (currentIndex >= 0) {
                                            backend.selectShotgridPlaylist(currentIndex)
                                        }
                                    }

                                    // Reset to first playlist when model changes
                                    onModelChanged: {
                                        if (model.length > 0) {
                                            currentIndex = 0
                                        } else {
                                            currentIndex = -1
                                        }
                                    }
                                }

                                Button {
                                    text: "Load Playlist"
                                    Layout.fillWidth: true
                                    enabled: backend.shotgridPlaylists.length > 0

                                    onClicked: {
                                        // Check if reloading the same playlist
                                        var isSamePlaylist = backend.selectedPlaylistId === backend.lastLoadedPlaylistId

                                        // Only show confirmation if there are existing versions AND loading a different playlist
                                        if (versionModel.rowCount() > 0 && !isSamePlaylist) {
                                            loadPlaylistConfirmDialog.open()
                                        } else {
                                            backend.loadShotgridPlaylist()
                                        }
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
                                    text: "Send Session to Flow PTR"
                                    Layout.fillWidth: true
                                    enabled: backend.shotgridUrl && backend.shotgridApiKey && backend.shotgridScriptName && backend.hasShotGridVersions

                                    onClicked: {
                                        backend.syncNotesToShotGrid()
                                    }

                                    onPressedChanged: {
                                        if (pressed && !enabled) {
                                            // Show warning when clicking disabled button
                                            if (!backend.shotgridUrl || !backend.shotgridApiKey || !backend.shotgridScriptName) {
                                                warningDialog.warningMessage = "Please configure ShotGrid credentials in Preferences (Ctrl+Shift+P) before syncing."
                                                warningDialog.open()
                                            } else if (!backend.hasShotGridVersions) {
                                                warningDialog.warningMessage = "Please load a ShotGrid playlist first. CSV playlists cannot be synced to ShotGrid."
                                                warningDialog.open()
                                            }
                                        }
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

                                    ToolTip.visible: hovered
                                    ToolTip.text: backend.shotgridUrl ? "Sync all playlist notes to ShotGrid (batch operation)" : "Configure ShotGrid in Preferences first"
                                    ToolTip.delay: 500
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
                                    text: "Add Version"
                                    Layout.fillWidth: true

                                    onClicked: {
                                        addVersionDialog.open()
                                    }

                                    background: Rectangle {
                                        color: "transparent"
                                        border.color: parent.hovered ? themeManager.accentHover : themeManager.accentColor
                                        border.width: 1
                                        radius: 6
                                    }

                                    contentItem: Text {
                                        text: parent.text
                                        color: parent.hovered ? themeManager.accentHover : themeManager.accentColor
                                        horizontalAlignment: Text.AlignHCenter
                                        verticalAlignment: Text.AlignVCenter
                                        font.pixelSize: 12
                                    }
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

                    Item {
                        Layout.fillWidth: true
                        Layout.fillHeight: true

                        ListView {
                            id: versionListView
                            anchors.fill: parent

                            model: versionModel
                            spacing: 8
                            clip: true
                            currentIndex: 0

                            Component.onCompleted: {
                                if (versionModel.rowCount() > 0) {
                                    currentIndex = 0
                                }
                            }

                            Connections {
                                target: backend
                                function onVersionsLoaded() {
                                    if (versionListView.count > 0) {
                                        versionListView.currentIndex = 0
                                    }
                                }
                            }

                            delegate: ItemDelegate {
                                width: versionListView.width - 16  // Reserve space for scrollbar

                                property bool isPinned: backend.pinnedVersionId === model.versionId

                                background: Rectangle {
                                    color: versionListView.currentIndex === index ? themeManager.accentColor : "#3a3a3a"
                                    radius: 6
                                    border.color: "#505050"
                                    border.width: 1
                                }

                                contentItem: RowLayout {
                                    spacing: 6

                                    // Pin icon
                                    Text {
                                        text: "📌"
                                        font.pixelSize: 12
                                        visible: isPinned
                                        Layout.alignment: Qt.AlignVCenter
                                    }

                                    // Version name
                                    Text {
                                        text: model.description || "Version " + model.versionId
                                        color: themeManager.textColor
                                        font.pixelSize: 14
                                        wrapMode: Text.WordWrap
                                        Layout.fillWidth: true
                                        Layout.alignment: Qt.AlignVCenter
                                    }
                                }

                                onClicked: {
                                    versionListView.currentIndex = index
                                    backend.selectVersion(model.versionId)
                                }

                                // Right-click context menu
                                MouseArea {
                                    anchors.fill: parent
                                    acceptedButtons: Qt.RightButton
                                    onClicked: function(mouse) {
                                        versionContextMenu.versionId = model.versionId
                                        versionContextMenu.isPinned = isPinned
                                        versionContextMenu.popup()
                                    }
                                }

                                Menu {
                                    id: versionContextMenu
                                    property string versionId: ""
                                    property bool isPinned: false

                                    MenuItem {
                                        text: versionContextMenu.isPinned ? "Unpin Version" : "Pin Version"
                                        onTriggered: {
                                            if (versionContextMenu.isPinned) {
                                                backend.unpinVersion()
                                            } else {
                                                backend.pinVersion(versionContextMenu.versionId)
                                            }
                                        }
                                    }
                                }
                            }

                            ScrollBar.vertical: ScrollBar {
                                policy: ScrollBar.AsNeeded
                            }
                        }

                        // Placeholder text when no versions are loaded
                        Text {
                            anchors.centerIn: parent
                            text: "Load a playlist to get started"
                            font.pixelSize: 14
                            color: themeManager.mutedTextColor
                            visible: versionListView.count === 0
                            horizontalAlignment: Text.AlignHCenter
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

                                Connections {
                                    target: backend
                                    function onSelectedVersionNameChanged() {
                                        console.log("Version name changed to:", backend.selectedVersionName)
                                    }
                                }
                            }

                            Text {
                                text: {
                                    if (backend.hasShotGridVersions && backend.selectedVersionShotGridId && backend.selectedVersionShotGridId !== "") {
                                        return "Version ID: " + backend.selectedVersionShotGridId
                                    } else if (!backend.hasShotGridVersions && backend.selectedVersionName) {
                                        return "Version ID: Not available"
                                    }
                                    return ""
                                }
                                font.pixelSize: 12
                                color: themeManager.mutedTextColor
                                visible: backend.selectedVersionName !== ""
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
                            text: "Summary"
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

                    // Split view with AI notes and notes entry
                    SplitView {
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        Layout.minimumHeight: 200
                        orientation: Qt.Vertical

                        // Top section - AI Generated Notes or Transcript
                        StackLayout {
                            SplitView.fillHeight: true
                            SplitView.minimumHeight: 100
                            currentIndex: tabBar.currentIndex

                            // Notes tab - AI Generated notes display
                            Item {
                                ScrollView {
                                    anchors.fill: parent

                                    TextArea {
                                        id: aiNotesArea
                                        text: backend.currentAiNotes || ""
                                        readOnly: true
                                        wrapMode: TextArea.Wrap
                                        color: themeManager.textColor
                                        placeholderText: "AI generated notes will appear here..."
                                        rightPadding: 120  // Make room for buttons

                                        // Always render as Markdown
                                        textFormat: TextEdit.MarkdownText

                                        background: Rectangle {
                                            color: themeManager.inputBackground
                                            border.color: themeManager.borderColor
                                            border.width: 1
                                            radius: 6
                                        }
                                    }
                                }

                                // AI control buttons overlaid in bottom-right corner
                                RowLayout {
                                    anchors.right: parent.right
                                    anchors.bottom: parent.bottom
                                    anchors.margins: 8
                                    spacing: 8

                                    Button {
                                        text: "↻"
                                        width: 40
                                        height: 40
                                        onClicked: {
                                            // Check if any LLM API key is set
                                            if (!backend.openaiApiKey && !backend.claudeApiKey && !backend.geminiApiKey) {
                                                warningDialog.warningMessage = "Please add an LLM API key in Preferences (Ctrl+Shift+P) to use AI note generation."
                                                warningDialog.open()
                                            } else {
                                                backend.generateNotes()
                                            }
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
                                            font.pixelSize: 18
                                        }
                                    }

                                    Button {
                                        text: "Add"
                                        width: 70
                                        height: 40
                                        onClicked: {
                                            var textToAdd = aiNotesArea.text || aiNotesArea.placeholderText
                                            backend.addAiNotesText(textToAdd)
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
                                            font.pixelSize: 18
                                        }
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

                        // Notes entry area - always visible at bottom
                        Rectangle {
                            id: notesEntryContainer
                            SplitView.fillHeight: true
                            SplitView.minimumHeight: 120
                            SplitView.preferredHeight: 180
                            color: themeManager.inputBackground

                            property bool markdownPreview: false
                            property var attachmentsList: []

                            // Load attachments when version changes
                            Connections {
                                target: backend
                                function onSelectedVersionIdChanged() {
                                    notesEntryContainer.attachmentsList = backend.getAttachments()
                                }
                                function onAttachmentsChanged() {
                                    notesEntryContainer.attachmentsList = backend.getAttachments()
                                }
                            }

                            Component.onCompleted: {
                                notesEntryContainer.attachmentsList = backend.getAttachments()
                            }

                            // Intercept markdown preview changes to set refresh flag BEFORE textFormat changes
                            onMarkdownPreviewChanged: {
                                // Set the flag BEFORE the textFormat binding updates
                                notesEntryArea.isRefreshing = true
                            }

                            ColumnLayout {
                                anchors.fill: parent
                                spacing: 0

                                // Status dropdown at top (bottom left of notes box)
                                RowLayout {
                                    Layout.fillWidth: true
                                    Layout.preferredHeight: backend.includeStatuses ? 40 : 0
                                    visible: backend.includeStatuses
                                    spacing: 10
                                    Layout.margins: 8

                                    Text {
                                        text: "Status:"
                                        color: themeManager.textColor
                                        font.pixelSize: 12
                                    }

                                    ComboBox {
                                        id: statusComboBox
                                        Layout.preferredWidth: 150
                                        model: backend.versionStatuses
                                        currentIndex: {
                                            var idx = backend.versionStatuses.indexOf(backend.selectedVersionStatus)
                                            return idx >= 0 ? idx : -1
                                        }

                                        onActivated: function(index) {
                                            if (index >= 0 && index < backend.versionStatuses.length) {
                                                backend.selectedVersionStatus = backend.versionStatuses[index]
                                            }
                                        }

                                        background: Rectangle {
                                            color: parent.hovered ? "#3a3a3a" : themeManager.cardBackground
                                            border.color: themeManager.borderColor
                                            border.width: 1
                                            radius: 4
                                        }

                                        contentItem: Text {
                                            text: statusComboBox.displayText
                                            color: themeManager.textColor
                                            font.pixelSize: 12
                                            verticalAlignment: Text.AlignVCenter
                                            leftPadding: 8
                                        }

                                        delegate: ItemDelegate {
                                            width: statusComboBox.width
                                            height: 30

                                            contentItem: Text {
                                                text: modelData
                                                color: themeManager.textColor
                                                font.pixelSize: 12
                                                verticalAlignment: Text.AlignVCenter
                                            }

                                            background: Rectangle {
                                                color: parent.hovered ? themeManager.accentColor : themeManager.cardBackground
                                            }
                                        }

                                        popup: Popup {
                                            y: statusComboBox.height
                                            width: statusComboBox.width
                                            padding: 0

                                            contentItem: ListView {
                                                clip: true
                                                implicitHeight: contentHeight
                                                model: statusComboBox.popup.visible ? statusComboBox.delegateModel : null
                                                currentIndex: statusComboBox.highlightedIndex

                                                ScrollIndicator.vertical: ScrollIndicator { }
                                            }

                                            background: Rectangle {
                                                color: themeManager.cardBackground
                                                border.color: themeManager.borderColor
                                                border.width: 1
                                                radius: 4
                                            }
                                        }
                                    }

                                    Item { Layout.fillWidth: true }
                                }

                                // Notes text area with Markdown preview toggle
                                Item {
                                    id: notesTextAreaItem
                                    Layout.fillWidth: true
                                    Layout.fillHeight: true

                                    ScrollView {
                                        anchors.fill: parent

                                        TextArea {
                                            id: notesEntryArea
                                            property bool isRefreshing: false

                                            // Use direct binding - it will update automatically when backend changes
                                            text: backend.currentVersionNote
                                            wrapMode: TextArea.Wrap
                                            color: themeManager.textColor
                                            placeholderText: notesEntryContainer.markdownPreview ? "No notes to preview" : "Type your notes here..."
                                            font.pixelSize: 14
                                            font.bold: false

                                            // Toggle between plain text and Markdown rendering
                                            textFormat: notesEntryContainer.markdownPreview ? TextEdit.MarkdownText : TextEdit.PlainText
                                            readOnly: notesEntryContainer.markdownPreview

                                            // Handle backend updates (version changes)
                                            Connections {
                                                target: backend
                                                function onCurrentVersionNoteChanged() {
                                                    // When backend changes (version switch), update the text
                                                    // Mark as refreshing to prevent triggering updateVersionNote
                                                    notesEntryArea.isRefreshing = true
                                                    notesEntryArea.text = backend.currentVersionNote
                                                    Qt.callLater(function() {
                                                        notesEntryArea.isRefreshing = false
                                                    })
                                                }
                                            }

                                            // Handle markdown preview mode toggle (cleanup phase)
                                            Connections {
                                                target: notesEntryContainer
                                                function onMarkdownPreviewChanged() {
                                                    if (!notesEntryContainer.markdownPreview) {
                                                        // Switching TO raw mode - restore raw text from backend
                                                        var rawText = backend.currentVersionNote
                                                        notesEntryArea.clear()
                                                        notesEntryArea.insert(0, rawText)
                                                        Qt.callLater(function() {
                                                            // Move cursor to end of text
                                                            notesEntryArea.cursorPosition = notesEntryArea.length
                                                            notesEntryArea.isRefreshing = false
                                                        })
                                                    } else {
                                                        // Switching TO preview mode - wait for render to complete
                                                        Qt.callLater(function() {
                                                            notesEntryArea.isRefreshing = false
                                                        })
                                                    }
                                                }
                                            }

                                            onTextChanged: (newText) => {
                                                if (!notesEntryContainer.markdownPreview && !notesEntryArea.isRefreshing) {
                                                    backend.updateVersionNote(text)
                                                }
                                            }

                                            Keys.onPressed: function(event) {
                                                // Allow shortcuts to work even when text area has focus
                                                if (event.modifiers === (Qt.ControlModifier | Qt.ShiftModifier)) {
                                                    if (event.key === Qt.Key_Up) {
                                                        event.accepted = false  // Let the shortcut handle it
                                                    } else if (event.key === Qt.Key_Down) {
                                                        event.accepted = false  // Let the shortcut handle it
                                                    } else if (event.key === Qt.Key_A) {
                                                        event.accepted = false
                                                    } else if (event.key === Qt.Key_R) {
                                                        event.accepted = false
                                                    } else if (event.key === Qt.Key_F) {
                                                        event.accepted = false
                                                    }
                                                }
                                            }

                                            background: Rectangle {
                                                color: "transparent"
                                            }
                                        }
                                    }
                                }

                                // Image thumbnails display area at bottom right
                                Item {
                                    Layout.fillWidth: true
                                    Layout.preferredHeight: notesEntryContainer.attachmentsList.length > 0 ? 80 : 0
                                    visible: notesEntryContainer.attachmentsList.length > 0

                                    ScrollView {
                                        anchors.right: parent.right
                                        anchors.bottom: parent.bottom
                                        anchors.top: parent.top
                                        anchors.margins: 4
                                        width: Math.min(parent.width, (notesEntryContainer.attachmentsList.length * 72))
                                        clip: true

                                        Flow {
                                            spacing: 8
                                            layoutDirection: Qt.RightToLeft

                                            Repeater {
                                                model: notesEntryContainer.attachmentsList

                                                Rectangle {
                                                    width: 64
                                                    height: 64
                                                    color: themeManager.cardBackground
                                                    radius: 4
                                                    border.color: themeManager.borderColor
                                                    border.width: 1

                                                    Image {
                                                        anchors.fill: parent
                                                        anchors.margins: 2
                                                        source: "file://" + modelData.filepath
                                                        fillMode: Image.PreserveAspectCrop
                                                        asynchronous: true
                                                        cache: false

                                                        MouseArea {
                                                            anchors.fill: parent
                                                            hoverEnabled: true
                                                            cursorShape: Qt.PointingHandCursor

                                                            ToolTip.visible: containsMouse
                                                            ToolTip.text: modelData.filename
                                                            ToolTip.delay: 500
                                                        }
                                                    }

                                                    // Delete button overlay
                                                    Rectangle {
                                                        anchors.top: parent.top
                                                        anchors.right: parent.right
                                                        anchors.margins: 2
                                                        width: 18
                                                        height: 18
                                                        color: "#d32f2f"
                                                        radius: 9
                                                        opacity: deleteMouseArea.containsMouse ? 1 : 0.7

                                                        Text {
                                                            anchors.centerIn: parent
                                                            text: "×"
                                                            color: "white"
                                                            font.pixelSize: 14
                                                            font.bold: true
                                                        }

                                                        MouseArea {
                                                            id: deleteMouseArea
                                                            anchors.fill: parent
                                                            hoverEnabled: true
                                                            cursorShape: Qt.PointingHandCursor

                                                            onClicked: {
                                                                backend.removeAttachment(modelData.filepath)
                                                            }

                                                            ToolTip.visible: containsMouse
                                                            ToolTip.text: "Remove image"
                                                            ToolTip.delay: 500
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }

                            // Markdown preview toggle button (direct child of Rectangle)
                            Button {
                                anchors.top: parent.top
                                anchors.right: parent.right
                                anchors.topMargin: 4
                                anchors.rightMargin: 4
                                width: 24
                                height: 24
                                z: 10

                                text: "M"

                                onClicked: {
                                    notesEntryContainer.markdownPreview = !notesEntryContainer.markdownPreview
                                }

                                background: Rectangle {
                                    color: parent.hovered ? themeManager.accentHover : (notesEntryContainer.markdownPreview ? themeManager.accentColor : "transparent")
                                    radius: 3
                                    opacity: parent.hovered ? 0.95 : (notesEntryContainer.markdownPreview ? 0.8 : 0.6)
                                    border.color: themeManager.borderColor
                                    border.width: notesEntryContainer.markdownPreview ? 0 : 1
                                }

                                contentItem: Text {
                                    text: parent.text
                                    color: themeManager.textColor
                                    horizontalAlignment: Text.AlignHCenter
                                    verticalAlignment: Text.AlignVCenter
                                    font.pixelSize: 12
                                    font.bold: true
                                }

                                ToolTip.visible: hovered
                                ToolTip.text: notesEntryContainer.markdownPreview ? "Show raw Markdown" : "Preview rendered Markdown"
                                ToolTip.delay: 500
                            }

                            // Border for the entire notes box
                            Rectangle {
                                anchors.fill: parent
                                color: "transparent"
                                border.color: themeManager.borderColor
                                border.width: 1
                                radius: 6
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

        property int minRequiredWidth: 550
        property int minRequiredHeight: 650
        property int previousWidth: 0
        property int previousHeight: 0
        property bool wasExpanded: false

        onAboutToShow: {
            // Check if window is too small for theme customizer dialog
            var needsWidthExpansion = root.width < minRequiredWidth
            var needsHeightExpansion = root.height < minRequiredHeight

            if (needsWidthExpansion || needsHeightExpansion) {
                // Store current dimensions
                previousWidth = root.width
                previousHeight = root.height
                wasExpanded = true

                // Expand to accommodate dialog
                if (needsWidthExpansion) {
                    var widthDiff = minRequiredWidth - root.width
                    root.x = root.x - Math.floor(widthDiff / 2)
                    root.width = minRequiredWidth
                }
                if (needsHeightExpansion) {
                    var heightDiff = minRequiredHeight - root.height
                    root.y = root.y - Math.floor(heightDiff / 2)
                    root.height = minRequiredHeight
                }
            } else {
                wasExpanded = false
            }
        }

        onClosed: {
            // Restore previous dimensions if we expanded
            if (wasExpanded) {
                var currentCenterX = root.x + root.width / 2
                var currentCenterY = root.y + root.height / 2

                root.width = previousWidth
                root.height = previousHeight

                root.x = currentCenterX - root.width / 2
                root.y = currentCenterY - root.height / 2

                wasExpanded = false
            }
        }

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

    // Reset Workspace Confirmation Dialog
    Dialog {
        id: resetWorkspaceDialog
        modal: true
        anchors.centerIn: parent
        width: 400
        title: "Reset Workspace"

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
                text: "⚠️ Warning"
                font.pixelSize: 18
                font.bold: true
                color: "#f57c00"
                Layout.alignment: Qt.AlignHCenter
            }

            Text {
                text: "Are you sure you want to reset the workspace?\n\nThis will remove all versions and notes. This action cannot be undone."
                font.pixelSize: 13
                color: themeManager.textColor
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
                horizontalAlignment: Text.AlignHCenter
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 12

                Button {
                    text: "Cancel"
                    Layout.fillWidth: true

                    onClicked: {
                        resetWorkspaceDialog.close()
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
                    text: "Reset"
                    Layout.fillWidth: true

                    onClicked: {
                        backend.resetWorkspace()
                        resetWorkspaceDialog.close()
                    }

                    background: Rectangle {
                        color: parent.hovered ? "#d32f2f" : "#f44336"
                        radius: 6
                    }

                    contentItem: Text {
                        text: parent.text
                        color: "#ffffff"
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                        font.pixelSize: 14
                    }
                }
            }
        }
    }

    // Preferences Dialog
    Dialog {
        id: preferencesDialog
        modal: true
        anchors.centerIn: parent
        width: 700
        height: 550
        title: "Preferences"

        property int minRequiredWidth: 750
        property int minRequiredHeight: 600
        property int previousWidth: 0
        property int previousHeight: 0
        property bool wasExpanded: false

        // Temporary properties to hold values before Apply
        property string tempSgUrl: ""
        property string tempSgApiKey: ""
        property string tempSgScriptName: ""
        property bool tempIncludeStatuses: false
        property string tempSgAuthorEmail: ""
        property bool tempPrependSessionHeader: false
        property string tempVexaApiKey: ""
        property string tempVexaApiUrl: ""
        property string tempOpenaiApiKey: ""
        property string tempClaudeApiKey: ""
        property string tempGeminiApiKey: ""
        property bool tempSgSyncTranscripts: false
        property string tempSgDnaTranscriptEntity: ""
        property string tempSgTranscriptField: ""
        property string tempSgVersionField: ""
        property string tempSgPlaylistField: ""

        onAboutToShow: {
            // Load current values into temporary properties
            tempSgUrl = backend.shotgridUrl
            tempSgApiKey = backend.shotgridApiKey
            tempSgScriptName = backend.shotgridScriptName
            tempIncludeStatuses = backend.includeStatuses
            tempSgAuthorEmail = backend.shotgridAuthorEmail || ""
            tempPrependSessionHeader = backend.prependSessionHeader || false
            tempVexaApiKey = backend.vexaApiKey
            tempVexaApiUrl = backend.vexaApiUrl
            tempOpenaiApiKey = backend.openaiApiKey
            tempClaudeApiKey = backend.claudeApiKey
            tempGeminiApiKey = backend.geminiApiKey
            tempSgSyncTranscripts = backend.sgSyncTranscripts
            tempSgDnaTranscriptEntity = backend.sgDnaTranscriptEntity || ""
            tempSgTranscriptField = backend.sgTranscriptField || "sg_body"
            tempSgVersionField = backend.sgVersionField || "sg_version"
            tempSgPlaylistField = backend.sgPlaylistField || "sg_playlist"

            // Update text fields with temporary values
            sgWebUrlInput.text = tempSgUrl
            sgApiKeyInput.text = tempSgApiKey
            sgScriptNameInput.text = tempSgScriptName
            includeStatusesToggle.checked = tempIncludeStatuses
            sgAuthorEmailInput.text = tempSgAuthorEmail
            prependSessionHeaderToggle.checked = tempPrependSessionHeader
            vexaApiKeyPrefInput.text = tempVexaApiKey
            vexaApiUrlPrefInput.text = tempVexaApiUrl
            openaiApiKeyPrefInput.text = tempOpenaiApiKey
            claudeApiKeyPrefInput.text = tempClaudeApiKey
            geminiApiKeyPrefInput.text = tempGeminiApiKey
            sgSyncTranscriptsToggle.checked = tempSgSyncTranscripts
            sgDnaTranscriptEntityInput.text = tempSgDnaTranscriptEntity
            sgTranscriptFieldInput.text = tempSgTranscriptField
            sgVersionFieldInput.text = tempSgVersionField
            sgPlaylistFieldInput.text = tempSgPlaylistField

            // Check if window is too small for preferences dialog
            var needsWidthExpansion = root.width < minRequiredWidth
            var needsHeightExpansion = root.height < minRequiredHeight

            if (needsWidthExpansion || needsHeightExpansion) {
                // Store current dimensions
                previousWidth = root.width
                previousHeight = root.height
                wasExpanded = true

                // Expand to accommodate dialog
                if (needsWidthExpansion) {
                    var widthDiff = minRequiredWidth - root.width
                    root.x = root.x - Math.floor(widthDiff / 2)
                    root.width = minRequiredWidth
                }
                if (needsHeightExpansion) {
                    var heightDiff = minRequiredHeight - root.height
                    root.y = root.y - Math.floor(heightDiff / 2)
                    root.height = minRequiredHeight
                }
            } else {
                wasExpanded = false
            }
        }

        onClosed: {
            // Restore previous dimensions if we expanded
            if (wasExpanded) {
                var currentCenterX = root.x + root.width / 2
                var currentCenterY = root.y + root.height / 2

                root.width = previousWidth
                root.height = previousHeight

                root.x = currentCenterX - root.width / 2
                root.y = currentCenterY - root.height / 2

                wasExpanded = false
            }
        }

        background: Rectangle {
            color: themeManager.cardBackground
            border.color: themeManager.borderColor
            border.width: 1
            radius: 8
        }

        ColumnLayout {
            anchors.fill: parent
            anchors.margins: 20
            spacing: 20

            // Tab Bar
            TabBar {
                id: prefsTabBar
                Layout.fillWidth: true
                background: Rectangle {
                    color: themeManager.cardBackground
                }

                TabButton {
                    text: "ShotGrid"
                    background: Rectangle {
                        color: parent.checked ? themeManager.accentColor : (parent.hovered ? "#555555" : themeManager.cardBackground)
                        radius: 4
                    }
                    contentItem: Text {
                        text: parent.text
                        color: parent.checked ? "white" : themeManager.textColor
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                }

                TabButton {
                    text: "Vexa"
                    background: Rectangle {
                        color: parent.checked ? themeManager.accentColor : (parent.hovered ? "#555555" : themeManager.cardBackground)
                        radius: 4
                    }
                    contentItem: Text {
                        text: parent.text
                        color: parent.checked ? "white" : themeManager.textColor
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                }

                TabButton {
                    text: "LLMs"
                    background: Rectangle {
                        color: parent.checked ? themeManager.accentColor : (parent.hovered ? "#555555" : themeManager.cardBackground)
                        radius: 4
                    }
                    contentItem: Text {
                        text: parent.text
                        color: parent.checked ? "white" : themeManager.textColor
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                }

                TabButton {
                    text: "Key Bindings"
                    background: Rectangle {
                        color: parent.checked ? themeManager.accentColor : (parent.hovered ? "#555555" : themeManager.cardBackground)
                        radius: 4
                    }
                    contentItem: Text {
                        text: parent.text
                        color: parent.checked ? "white" : themeManager.textColor
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                }
            }

            // Stack Layout for tab content
            StackLayout {
                Layout.fillWidth: true
                Layout.fillHeight: true
                currentIndex: prefsTabBar.currentIndex

                // ShotGrid Tab
                ScrollView {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true

                    ColumnLayout {
                        width: parent.parent.width - 40
                        spacing: 15

                        Text {
                            text: "ShotGrid Integration"
                            font.pixelSize: 16
                            font.bold: true
                            color: themeManager.textColor
                        }

                        Rectangle {
                            Layout.fillWidth: true
                            height: 1
                            color: themeManager.borderColor
                        }

                        // ShotGrid Web URL
                        ColumnLayout {
                            spacing: 5
                            Layout.fillWidth: true

                            Text {
                                text: "ShotGrid Web URL:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                            }

                            TextField {
                                id: sgWebUrlInput
                                Layout.fillWidth: true
                                placeholderText: "https://yoursite.shotgrid.autodesk.com"
                                color: themeManager.textColor
                                background: Rectangle {
                                    color: themeManager.cardBackground
                                    border.color: themeManager.borderColor
                                    border.width: 1
                                    radius: 4
                                }
                            }
                        }

                        // ShotGrid API Key
                        ColumnLayout {
                            spacing: 5
                            Layout.fillWidth: true

                            Text {
                                text: "API Key:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                            }

                            TextField {
                                id: sgApiKeyInput
                                Layout.fillWidth: true
                                placeholderText: "Your ShotGrid API Key"
                                echoMode: TextInput.Password
                                color: themeManager.textColor
                                background: Rectangle {
                                    color: themeManager.cardBackground
                                    border.color: themeManager.borderColor
                                    border.width: 1
                                    radius: 4
                                }
                            }
                        }

                        // Script Name
                        ColumnLayout {
                            spacing: 5
                            Layout.fillWidth: true

                            Text {
                                text: "Script Name:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                            }

                            TextField {
                                id: sgScriptNameInput
                                Layout.fillWidth: true
                                placeholderText: "DNA Script"
                                color: themeManager.textColor
                                background: Rectangle {
                                    color: themeManager.cardBackground
                                    border.color: themeManager.borderColor
                                    border.width: 1
                                    radius: 4
                                }
                            }
                        }

                        Rectangle {
                            Layout.fillWidth: true
                            height: 1
                            color: themeManager.borderColor
                            Layout.topMargin: 10
                            Layout.bottomMargin: 10
                        }

                        // Include Statuses Toggle
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 10

                            Text {
                                text: "Include Statuses:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                            }

                            Switch {
                                id: includeStatusesToggle

                                indicator: Rectangle {
                                    implicitWidth: 48
                                    implicitHeight: 24
                                    x: parent.leftPadding
                                    y: parent.height / 2 - height / 2
                                    radius: 12
                                    color: parent.checked ? themeManager.accentColor : "#555555"
                                    border.color: parent.checked ? themeManager.accentColor : "#666666"

                                    Rectangle {
                                        x: parent.parent.checked ? parent.width - width - 2 : 2
                                        y: (parent.height - height) / 2
                                        width: 20
                                        height: 20
                                        radius: 10
                                        color: "white"

                                        Behavior on x {
                                            NumberAnimation { duration: 200 }
                                        }
                                    }
                                }
                            }

                            Text {
                                text: "Enable version status dropdown in notes"
                                font.pixelSize: 11
                                color: themeManager.mutedTextColor
                                Layout.fillWidth: true
                            }
                        }

                        Rectangle {
                            Layout.fillWidth: true
                            height: 1
                            color: themeManager.borderColor
                            Layout.topMargin: 10
                            Layout.bottomMargin: 10
                        }

                        Text {
                            text: "Note Sync Settings"
                            font.pixelSize: 14
                            font.bold: true
                            color: themeManager.textColor
                        }

                        // Author Email
                        ColumnLayout {
                            spacing: 5
                            Layout.fillWidth: true

                            Text {
                                text: "Author Email:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                            }

                            TextField {
                                id: sgAuthorEmailInput
                                Layout.fillWidth: true
                                placeholderText: "user@studio.com"
                                color: themeManager.textColor
                                background: Rectangle {
                                    color: themeManager.cardBackground
                                    border.color: themeManager.borderColor
                                    border.width: 1
                                    radius: 4
                                }
                            }

                            Text {
                                text: "Email for note author attribution in ShotGrid"
                                font.pixelSize: 10
                                color: themeManager.mutedTextColor
                            }
                        }

                        // Prepend Session Header Toggle
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 10

                            Text {
                                text: "Session Header:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                            }

                            Switch {
                                id: prependSessionHeaderToggle

                                indicator: Rectangle {
                                    implicitWidth: 48
                                    implicitHeight: 24
                                    x: parent.leftPadding
                                    y: parent.height / 2 - height / 2
                                    radius: 12
                                    color: parent.checked ? themeManager.accentColor : "#555555"
                                    border.color: parent.checked ? themeManager.accentColor : "#666666"

                                    Rectangle {
                                        x: parent.parent.checked ? parent.width - width - 2 : 2
                                        y: (parent.height - height) / 2
                                        width: 20
                                        height: 20
                                        radius: 10
                                        color: "white"

                                        Behavior on x {
                                            NumberAnimation { duration: 200 }
                                        }
                                    }
                                }
                            }

                            Text {
                                text: "Prepend playlist name and date to notes"
                                font.pixelSize: 11
                                color: themeManager.mutedTextColor
                                Layout.fillWidth: true
                            }
                        }

                        // DNA Transcript Settings Section
                        Rectangle {
                            Layout.fillWidth: true
                            height: 1
                            color: themeManager.borderColor
                            Layout.topMargin: 10
                            Layout.bottomMargin: 10
                        }

                        Text {
                            text: "DNA Transcript Settings"
                            font.pixelSize: 14
                            font.bold: true
                            color: themeManager.textColor
                        }

                        // Sync Transcripts Toggle
                        RowLayout {
                            Layout.fillWidth: true
                            spacing: 10

                            Text {
                                text: "Sync Transcripts:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                            }

                            Switch {
                                id: sgSyncTranscriptsToggle

                                indicator: Rectangle {
                                    implicitWidth: 48
                                    implicitHeight: 24
                                    x: parent.leftPadding
                                    y: parent.height / 2 - height / 2
                                    radius: 12
                                    color: parent.checked ? themeManager.accentColor : "#555555"
                                    border.color: parent.checked ? themeManager.accentColor : "#666666"

                                    Rectangle {
                                        x: parent.parent.checked ? parent.width - width - 2 : 2
                                        y: (parent.height - height) / 2
                                        width: 20
                                        height: 20
                                        radius: 10
                                        color: "white"

                                        Behavior on x {
                                            NumberAnimation { duration: 200 }
                                        }
                                    }
                                }
                            }

                            Text {
                                text: "Enable transcript sync to ShotGrid custom entity"
                                font.pixelSize: 11
                                color: themeManager.mutedTextColor
                                Layout.fillWidth: true
                            }
                        }

                        // Transcript Entity Field
                        ColumnLayout {
                            spacing: 5
                            Layout.fillWidth: true

                            Text {
                                text: "Transcript Entity:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                            }

                            TextField {
                                id: sgDnaTranscriptEntityInput
                                Layout.fillWidth: true
                                placeholderText: "e.g., CustomEntity01"
                                color: themeManager.textColor
                                enabled: sgSyncTranscriptsToggle.checked
                                background: Rectangle {
                                    color: themeManager.cardBackground
                                    border.color: themeManager.borderColor
                                    border.width: 1
                                    radius: 4
                                }
                            }

                            Text {
                                text: "Entity type code (not display name) - e.g., 'CustomEntity01' not 'DNA Transcripts'"
                                font.pixelSize: 10
                                color: themeManager.mutedTextColor
                            }
                        }

                        // Transcript Field
                        ColumnLayout {
                            spacing: 5
                            Layout.fillWidth: true

                            Text {
                                text: "Transcript Field:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                            }

                            TextField {
                                id: sgTranscriptFieldInput
                                Layout.fillWidth: true
                                placeholderText: "Default: sg_body"
                                color: themeManager.textColor
                                enabled: sgSyncTranscriptsToggle.checked
                                background: Rectangle {
                                    color: themeManager.cardBackground
                                    border.color: themeManager.borderColor
                                    border.width: 1
                                    radius: 4
                                }
                            }
                        }

                        // Version Field
                        ColumnLayout {
                            spacing: 5
                            Layout.fillWidth: true

                            Text {
                                text: "Version Field:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                            }

                            TextField {
                                id: sgVersionFieldInput
                                Layout.fillWidth: true
                                placeholderText: "Default: sg_version"
                                color: themeManager.textColor
                                enabled: sgSyncTranscriptsToggle.checked
                                background: Rectangle {
                                    color: themeManager.cardBackground
                                    border.color: themeManager.borderColor
                                    border.width: 1
                                    radius: 4
                                }
                            }
                        }

                        // Playlist Field
                        ColumnLayout {
                            spacing: 5
                            Layout.fillWidth: true

                            Text {
                                text: "Playlist Field:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                            }

                            TextField {
                                id: sgPlaylistFieldInput
                                Layout.fillWidth: true
                                placeholderText: "Default: sg_playlist"
                                color: themeManager.textColor
                                enabled: sgSyncTranscriptsToggle.checked
                                background: Rectangle {
                                    color: themeManager.cardBackground
                                    border.color: themeManager.borderColor
                                    border.width: 1
                                    radius: 4
                                }
                            }
                        }

                        Item { Layout.fillHeight: true }
                    }
                }

                // Vexa Tab
                ScrollView {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true

                    ColumnLayout {
                        width: parent.parent.width - 40
                        spacing: 15

                        Text {
                            text: "Vexa Meeting Integration"
                            font.pixelSize: 16
                            font.bold: true
                            color: themeManager.textColor
                        }

                        Rectangle {
                            Layout.fillWidth: true
                            height: 1
                            color: themeManager.borderColor
                        }

                        // Vexa API Key
                        ColumnLayout {
                            spacing: 5
                            Layout.fillWidth: true

                            Text {
                                text: "Vexa API Key:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                            }

                            TextField {
                                id: vexaApiKeyPrefInput
                                Layout.fillWidth: true
                                placeholderText: "Your Vexa API Key"
                                echoMode: TextInput.Password
                                color: themeManager.textColor
                                background: Rectangle {
                                    color: themeManager.cardBackground
                                    border.color: themeManager.borderColor
                                    border.width: 1
                                    radius: 4
                                }
                            }
                        }

                        // Vexa API URL
                        ColumnLayout {
                            spacing: 5
                            Layout.fillWidth: true

                            Text {
                                text: "Vexa API URL:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                            }

                            TextField {
                                id: vexaApiUrlPrefInput
                                Layout.fillWidth: true
                                placeholderText: "https://api.cloud.vexa.ai"
                                color: themeManager.textColor
                                background: Rectangle {
                                    color: themeManager.cardBackground
                                    border.color: themeManager.borderColor
                                    border.width: 1
                                    radius: 4
                                }
                            }
                        }

                        Item { Layout.fillHeight: true }
                    }
                }

                // LLMs Tab
                ScrollView {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true

                    ColumnLayout {
                        width: parent.parent.width - 40
                        spacing: 15

                        Text {
                            text: "LLM API Configuration"
                            font.pixelSize: 16
                            font.bold: true
                            color: themeManager.textColor
                        }

                        Rectangle {
                            Layout.fillWidth: true
                            height: 1
                            color: themeManager.borderColor
                        }

                        // OpenAI
                        ColumnLayout {
                            spacing: 5
                            Layout.fillWidth: true

                            Text {
                                text: "OpenAI API Key:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                            }

                            TextField {
                                id: openaiApiKeyPrefInput
                                Layout.fillWidth: true
                                placeholderText: "sk-..."
                                echoMode: TextInput.Password
                                color: themeManager.textColor
                                background: Rectangle {
                                    color: themeManager.cardBackground
                                    border.color: themeManager.borderColor
                                    border.width: 1
                                    radius: 4
                                }
                            }
                        }

                        // Claude
                        ColumnLayout {
                            spacing: 5
                            Layout.fillWidth: true

                            Text {
                                text: "Claude API Key:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                            }

                            TextField {
                                id: claudeApiKeyPrefInput
                                Layout.fillWidth: true
                                placeholderText: "sk-ant-..."
                                echoMode: TextInput.Password
                                color: themeManager.textColor
                                background: Rectangle {
                                    color: themeManager.cardBackground
                                    border.color: themeManager.borderColor
                                    border.width: 1
                                    radius: 4
                                }
                            }
                        }

                        // Gemini
                        ColumnLayout {
                            spacing: 5
                            Layout.fillWidth: true

                            Text {
                                text: "Gemini API Key:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                            }

                            TextField {
                                id: geminiApiKeyPrefInput
                                Layout.fillWidth: true
                                placeholderText: "Your Gemini API Key"
                                echoMode: TextInput.Password
                                color: themeManager.textColor
                                background: Rectangle {
                                    color: themeManager.cardBackground
                                    border.color: themeManager.borderColor
                                    border.width: 1
                                    radius: 4
                                }
                            }
                        }

                        Item { Layout.fillHeight: true }
                    }
                }

                // Key Bindings Tab
                ScrollView {
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    clip: true

                    ColumnLayout {
                        width: parent.parent.width - 40
                        spacing: 15

                        Text {
                            text: "Keyboard Shortcuts"
                            font.pixelSize: 16
                            font.bold: true
                            color: themeManager.textColor
                        }

                        Rectangle {
                            Layout.fillWidth: true
                            height: 1
                            color: themeManager.borderColor
                        }

                        // Key bindings list
                        GridLayout {
                            Layout.fillWidth: true
                            columns: 2
                            columnSpacing: 20
                            rowSpacing: 12

                            // Theme Customizer
                            Text {
                                text: "Open Theme Customizer:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                                Layout.alignment: Qt.AlignRight
                            }
                            Text {
                                text: "Ctrl+Shift+T"
                                font.pixelSize: 12
                                font.bold: true
                                color: themeManager.accentColor
                            }

                            // Preferences
                            Text {
                                text: "Open Preferences:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                                Layout.alignment: Qt.AlignRight
                            }
                            Text {
                                text: "Ctrl+Shift+P"
                                font.pixelSize: 12
                                font.bold: true
                                color: themeManager.accentColor
                            }

                            // Toggle Upper Widgets
                            Text {
                                text: "Toggle Upper Widgets:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                                Layout.alignment: Qt.AlignRight
                            }
                            Text {
                                text: "Ctrl+Shift+U"
                                font.pixelSize: 12
                                font.bold: true
                                color: themeManager.accentColor
                            }

                            // Toggle Versions List
                            Text {
                                text: "Toggle Versions List:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                                Layout.alignment: Qt.AlignRight
                            }
                            Text {
                                text: "Ctrl+Shift+S"
                                font.pixelSize: 12
                                font.bold: true
                                color: themeManager.accentColor
                            }

                            // Previous Version
                            Text {
                                text: "Previous Version:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                                Layout.alignment: Qt.AlignRight
                            }
                            Text {
                                text: "Ctrl+Shift+Up"
                                font.pixelSize: 12
                                font.bold: true
                                color: themeManager.accentColor
                            }

                            // Next Version
                            Text {
                                text: "Next Version:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                                Layout.alignment: Qt.AlignRight
                            }
                            Text {
                                text: "Ctrl+Shift+Down"
                                font.pixelSize: 12
                                font.bold: true
                                color: themeManager.accentColor
                            }

                            // Add AI Notes
                            Text {
                                text: "Add AI Notes to Notes:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                                Layout.alignment: Qt.AlignRight
                            }
                            Text {
                                text: "Ctrl+Shift+A"
                                font.pixelSize: 12
                                font.bold: true
                                color: themeManager.accentColor
                            }

                            // Regenerate AI Notes
                            Text {
                                text: "Regenerate AI Notes:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                                Layout.alignment: Qt.AlignRight
                            }
                            Text {
                                text: "Ctrl+Shift+R"
                                font.pixelSize: 12
                                font.bold: true
                                color: themeManager.accentColor
                            }

                            // Toggle Notes/Transcript
                            Text {
                                text: "Toggle Notes/Transcript:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                                Layout.alignment: Qt.AlignRight
                            }
                            Text {
                                text: "Ctrl+Shift+D"
                                font.pixelSize: 12
                                font.bold: true
                                color: themeManager.accentColor
                            }

                            // Toggle Markdown Preview
                            Text {
                                text: "Toggle Markdown Preview:"
                                font.pixelSize: 12
                                color: themeManager.textColor
                                Layout.alignment: Qt.AlignRight
                            }
                            Text {
                                text: "Ctrl+Shift+M"
                                font.pixelSize: 12
                                font.bold: true
                                color: themeManager.accentColor
                            }
                        }

                        Item { Layout.fillHeight: true }
                    }
                }
            }

            // Button row
            RowLayout {
                spacing: 10
                Layout.alignment: Qt.AlignRight

                Button {
                    text: "Cancel"
                    background: Rectangle {
                        color: parent.hovered ? "#555555" : "#444444"
                        radius: 4
                    }
                    contentItem: Text {
                        text: parent.text
                        color: themeManager.textColor
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                    onClicked: {
                        preferencesDialog.reject()
                    }
                }

                Button {
                    text: "Apply"
                    background: Rectangle {
                        color: parent.hovered ? themeManager.accentHover : themeManager.accentColor
                        radius: 4
                    }
                    contentItem: Text {
                        text: parent.text
                        color: "white"
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                    onClicked: {
                        // ShotGrid settings
                        backend.shotgridUrl = sgWebUrlInput.text
                        backend.shotgridApiKey = sgApiKeyInput.text
                        backend.shotgridScriptName = sgScriptNameInput.text
                        backend.includeStatuses = includeStatusesToggle.checked
                        backend.shotgridAuthorEmail = sgAuthorEmailInput.text
                        backend.prependSessionHeader = prependSessionHeaderToggle.checked

                        // DNA Transcript settings
                        backend.sgSyncTranscripts = sgSyncTranscriptsToggle.checked
                        backend.sgDnaTranscriptEntity = sgDnaTranscriptEntityInput.text
                        backend.sgTranscriptField = sgTranscriptFieldInput.text
                        backend.sgVersionField = sgVersionFieldInput.text
                        backend.sgPlaylistField = sgPlaylistFieldInput.text

                        // Vexa settings
                        backend.vexaApiKey = vexaApiKeyPrefInput.text
                        backend.vexaApiUrl = vexaApiUrlPrefInput.text

                        // LLM settings
                        backend.openaiApiKey = openaiApiKeyPrefInput.text
                        backend.claudeApiKey = claudeApiKeyPrefInput.text
                        backend.geminiApiKey = geminiApiKeyPrefInput.text

                        preferencesDialog.accept()
                    }
                }
            }
        }
    }

    // About Dialog
    Dialog {
        id: aboutDialog
        modal: true
        anchors.centerIn: parent
        width: 500
        title: "About Dailies Notes Assistant"

        property int minRequiredWidth: 550
        property int minRequiredHeight: 650
        property int previousWidth: 0
        property int previousHeight: 0
        property bool wasExpanded: false

        onAboutToShow: {
            // Check if window is too small for about dialog
            var needsWidthExpansion = root.width < minRequiredWidth
            var needsHeightExpansion = root.height < minRequiredHeight

            if (needsWidthExpansion || needsHeightExpansion) {
                // Store current dimensions
                previousWidth = root.width
                previousHeight = root.height
                wasExpanded = true

                // Expand to accommodate dialog
                if (needsWidthExpansion) {
                    var widthDiff = minRequiredWidth - root.width
                    root.x = root.x - Math.floor(widthDiff / 2)
                    root.width = minRequiredWidth
                }
                if (needsHeightExpansion) {
                    var heightDiff = minRequiredHeight - root.height
                    root.y = root.y - Math.floor(heightDiff / 2)
                    root.height = minRequiredHeight
                }
            } else {
                wasExpanded = false
            }
        }

        onClosed: {
            // Restore previous dimensions if we expanded
            if (wasExpanded) {
                var currentCenterX = root.x + root.width / 2
                var currentCenterY = root.y + root.height / 2

                root.width = previousWidth
                root.height = previousHeight

                root.x = currentCenterX - root.width / 2
                root.y = currentCenterY - root.height / 2

                wasExpanded = false
            }
        }

        background: Rectangle {
            color: themeManager.cardBackground
            border.color: themeManager.borderColor
            border.width: 1
            radius: 8
        }

        ColumnLayout {
            anchors.fill: parent
            spacing: 20

            // Logo
            Image {
                source: "../img/DNA_temp_logo.png"
                Layout.preferredWidth: 400
                Layout.preferredHeight: 200
                Layout.alignment: Qt.AlignHCenter
                fillMode: Image.PreserveAspectFit
            }

            Text {
                text: "DNA Dailies Notes Assistant"
                font.pixelSize: 20
                font.bold: true
                color: themeManager.textColor
                Layout.alignment: Qt.AlignHCenter
            }

            Text {
                text: "Version 3.0 Alpha"
                font.pixelSize: 14
                color: themeManager.mutedTextColor
                Layout.alignment: Qt.AlignHCenter
            }

            Rectangle {
                Layout.fillWidth: true
                Layout.preferredHeight: 1
                color: themeManager.borderColor
            }

            Text {
                text: "A Qt-based desktop application from the Academy Software Foundation for managing dailies notes with AI assistance and meeting transcription."
                font.pixelSize: 12
                color: themeManager.textColor
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
                horizontalAlignment: Text.AlignHCenter
            }

            Item { Layout.fillHeight: true }

            Button {
                text: "Close"
                Layout.alignment: Qt.AlignHCenter
                Layout.preferredWidth: 100

                onClicked: {
                    aboutDialog.close()
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

            Item { Layout.fillHeight: true }
        }
    }

    // Warning Dialog (reusable)
    Dialog {
        id: warningDialog
        modal: true
        anchors.centerIn: parent
        width: 400
        title: "Warning"

        property string warningMessage: ""

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
                text: "ℹ️ Information"
                font.pixelSize: 18
                font.bold: true
                color: themeManager.accentColor
                Layout.alignment: Qt.AlignHCenter
            }

            Text {
                text: {
                    // Replace keyboard shortcuts with styled version
                    var msg = warningDialog.warningMessage
                    // Match patterns like (Ctrl+Shift+P)
                    msg = msg.replace(/\((Ctrl\+Shift\+[A-Z])\)/g, function(match, shortcut) {
                        return '(<font color="' + themeManager.accentColor + '"><b>' + shortcut + '</b></font>)'
                    })
                    return msg
                }
                font.pixelSize: 13
                color: themeManager.textColor
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
                horizontalAlignment: Text.AlignHCenter
                textFormat: Text.RichText
            }

            Button {
                text: "OK"
                Layout.alignment: Qt.AlignHCenter
                Layout.preferredWidth: 100

                onClicked: {
                    warningDialog.close()
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

    // Sync Complete Dialog
    Dialog {
        id: syncCompleteDialog
        modal: true
        anchors.centerIn: parent
        width: 500
        title: "Sync Complete"

        property int syncedCount: 0
        property int skippedCount: 0
        property int failedCount: 0
        property int attachmentsCount: 0
        property bool statusesUpdated: false

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
                text: "✓ Sync to ShotGrid Complete"
                font.pixelSize: 18
                font.bold: true
                color: "#4caf50"
                Layout.alignment: Qt.AlignHCenter
            }

            Rectangle {
                Layout.fillWidth: true
                height: 1
                color: themeManager.borderColor
            }

            ColumnLayout {
                Layout.fillWidth: true
                spacing: 12

                Text {
                    text: "<b>Summary:</b>"
                    font.pixelSize: 14
                    color: themeManager.textColor
                    textFormat: Text.RichText
                }

                Text {
                    text: "✓ <b>" + syncCompleteDialog.syncedCount + "</b> version(s) synced successfully"
                    font.pixelSize: 13
                    color: themeManager.textColor
                    visible: syncCompleteDialog.syncedCount > 0
                    textFormat: Text.RichText
                }

                Text {
                    text: "⊘ <b>" + syncCompleteDialog.skippedCount + "</b> version(s) skipped (duplicates)"
                    font.pixelSize: 13
                    color: themeManager.mutedTextColor
                    visible: syncCompleteDialog.skippedCount > 0
                    textFormat: Text.RichText
                }

                Text {
                    text: "✗ <b>" + syncCompleteDialog.failedCount + "</b> version(s) failed"
                    font.pixelSize: 13
                    color: "#f44336"
                    visible: syncCompleteDialog.failedCount > 0
                    textFormat: Text.RichText
                }

                Text {
                    text: "📎 <b>" + syncCompleteDialog.attachmentsCount + "</b> attachment(s) uploaded"
                    font.pixelSize: 13
                    color: themeManager.textColor
                    visible: syncCompleteDialog.attachmentsCount > 0
                    textFormat: Text.RichText
                }

                Text {
                    text: "🏷️ Version statuses updated"
                    font.pixelSize: 13
                    color: themeManager.textColor
                    visible: syncCompleteDialog.statusesUpdated
                    textFormat: Text.RichText
                }
            }

            Rectangle {
                Layout.fillWidth: true
                height: 1
                color: themeManager.borderColor
            }

            Button {
                text: "OK"
                Layout.alignment: Qt.AlignHCenter
                Layout.preferredWidth: 120

                onClicked: {
                    syncCompleteDialog.close()
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

    // Switch to CSV Warning Dialog
    Dialog {
        id: switchToCsvWarningDialog
        modal: true
        anchors.centerIn: parent
        width: 450
        title: "Switch to CSV Playlist"

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
                text: "⚠️ Warning"
                font.pixelSize: 18
                font.bold: true
                color: "#f57c00"
                Layout.alignment: Qt.AlignHCenter
            }

            Text {
                text: "You are using a playlist from Flow Production Tracking. If you would like to add versions to the session, please add them there.\n\nWould you like to clear the current session and use a CSV instead?"
                font.pixelSize: 13
                color: themeManager.textColor
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
                horizontalAlignment: Text.AlignHCenter
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 12

                Button {
                    text: "Cancel"
                    Layout.fillWidth: true

                    onClicked: {
                        switchToCsvWarningDialog.close()
                        playlistTabBar.pendingIndex = -1
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
                    text: "Clear & Use CSV"
                    Layout.fillWidth: true

                    onClicked: {
                        switchToCsvWarningDialog.close()
                        backend.resetWorkspace()
                        playlistTabBar.currentIndex = playlistTabBar.pendingIndex
                        playlistTabBar.pendingIndex = -1
                    }

                    background: Rectangle {
                        color: parent.hovered ? themeManager.accentHover : themeManager.accentColor
                        radius: 6
                    }

                    contentItem: Text {
                        text: parent.text
                        color: "#ffffff"
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                        font.pixelSize: 14
                    }
                }
            }
        }
    }

    // Load Playlist Confirmation Dialog
    Dialog {
        id: loadPlaylistConfirmDialog
        modal: true
        anchors.centerIn: parent
        width: 400
        title: "Load Playlist"

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
                text: "⚠️ Warning"
                font.pixelSize: 18
                font.bold: true
                color: "#f57c00"
                Layout.alignment: Qt.AlignHCenter
            }

            Text {
                text: "Are you sure you want to load a new playlist?\n\nThis will remove all existing versions and notes from the current session."
                font.pixelSize: 13
                color: themeManager.textColor
                wrapMode: Text.WordWrap
                Layout.fillWidth: true
                horizontalAlignment: Text.AlignHCenter
            }

            RowLayout {
                Layout.fillWidth: true
                spacing: 12

                Button {
                    text: "Cancel"
                    Layout.fillWidth: true

                    onClicked: {
                        loadPlaylistConfirmDialog.close()
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
                    text: "Load Playlist"
                    Layout.fillWidth: true

                    onClicked: {
                        loadPlaylistConfirmDialog.close()
                        backend.loadShotgridPlaylist()
                    }

                    background: Rectangle {
                        color: parent.hovered ? themeManager.accentHover : themeManager.accentColor
                        radius: 6
                    }

                    contentItem: Text {
                        text: parent.text
                        color: "#ffffff"
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                        font.pixelSize: 14
                    }
                }
            }
        }
    }

    // Add Version Dialog
    Dialog {
        id: addVersionDialog
        modal: true
        anchors.centerIn: parent
        width: 400
        title: "Add Version"

        background: Rectangle {
            color: themeManager.cardBackground
            border.color: themeManager.borderColor
            border.width: 1
            radius: 8
        }

        ColumnLayout {
            anchors.fill: parent
            spacing: 15

            Text {
                text: "Enter version name:"
                font.pixelSize: 12
                color: themeManager.textColor
            }

            TextField {
                id: versionNameInput
                Layout.fillWidth: true
                placeholderText: "e.g., SH010_ANIM_v001"
                color: themeManager.textColor
                background: Rectangle {
                    color: themeManager.cardBackground
                    border.color: themeManager.borderColor
                    border.width: 1
                    radius: 4
                }

                Keys.onReturnPressed: {
                    if (text.trim() !== "") {
                        backend.addVersion(text)
                        addVersionDialog.close()
                        text = ""
                    }
                }
            }

            RowLayout {
                Layout.alignment: Qt.AlignRight
                spacing: 10

                Button {
                    text: "Cancel"
                    background: Rectangle {
                        color: parent.hovered ? "#555555" : "#444444"
                        radius: 4
                    }
                    contentItem: Text {
                        text: parent.text
                        color: themeManager.textColor
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                    onClicked: {
                        addVersionDialog.close()
                        versionNameInput.text = ""
                    }
                }

                Button {
                    text: "Add"
                    enabled: versionNameInput.text.trim() !== ""
                    background: Rectangle {
                        color: parent.enabled ? (parent.hovered ? themeManager.accentHover : themeManager.accentColor) : "#3a3a3a"
                        radius: 4
                    }
                    contentItem: Text {
                        text: parent.text
                        color: parent.enabled ? "white" : "#555555"
                        horizontalAlignment: Text.AlignHCenter
                        verticalAlignment: Text.AlignVCenter
                    }
                    onClicked: {
                        if (versionNameInput.text.trim() !== "") {
                            backend.addVersion(versionNameInput.text)
                            addVersionDialog.close()
                            versionNameInput.text = ""
                        }
                    }
                }
            }
        }

        onOpened: {
            versionNameInput.forceActiveFocus()
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
        signal colorChanged(newColor: string)

        function emitColorChanged(color) {
            colorChanged(color)
        }

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
                    // Store reference to the picker
                    colorPickerService.colorSelected.connect(function(hexColor) {
                        emitColorChanged(hexColor)
                        colorPickerService.colorSelected.disconnect(arguments.callee)
                    })
                    // Show RPA color picker
                    colorPickerService.showColorPicker(currentColor.toString())
                }
            }
        }

        TextField {
            id: colorTextField
            Layout.fillWidth: true
            text: currentColor
            color: themeManager.textColor

            background: Rectangle {
                color: themeManager.inputBackground
                border.color: themeManager.borderColor
                border.width: 1
                radius: 4
            }

            onTextChanged: (newText) => {
                if (colorTextField.text.match(/^#[0-9A-Fa-f]{6}$/)) {
                    emitColorChanged(colorTextField.text)
                }
            }
        }
    }

    // Color Picker Dialog
    Dialog {
        id: colorDialog
        modal: true
        anchors.centerIn: parent
        width: 450
        height: 650
        title: "Pick a Color"

        property color currentColor: "#000000"
        property var targetPicker: null

        property real hue: 0
        property real saturation: 1
        property real lightness: 0.5

        function hslToColor(h, s, l) {
            var c = (1 - Math.abs(2 * l - 1)) * s
            var x = c * (1 - Math.abs(((h / 60) % 2) - 1))
            var m = l - c / 2
            var r = 0, g = 0, b = 0

            if (h >= 0 && h < 60) {
                r = c; g = x; b = 0
            } else if (h >= 60 && h < 120) {
                r = x; g = c; b = 0
            } else if (h >= 120 && h < 180) {
                r = 0; g = c; b = x
            } else if (h >= 180 && h < 240) {
                r = 0; g = x; b = c
            } else if (h >= 240 && h < 300) {
                r = x; g = 0; b = c
            } else {
                r = c; g = 0; b = x
            }

            r = Math.round((r + m) * 255)
            g = Math.round((g + m) * 255)
            b = Math.round((b + m) * 255)

            return Qt.rgba(r / 255, g / 255, b / 255, 1)
        }

        function updateColorFromHSL() {
            currentColor = hslToColor(hue, saturation, lightness)
        }

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

            // Color Wheel
            Item {
                Layout.fillWidth: true
                Layout.preferredHeight: 250
                Layout.alignment: Qt.AlignHCenter

                // Saturation/Lightness square
                Rectangle {
                    id: colorSquare
                    width: 250
                    height: 250
                    anchors.centerIn: parent

                    gradient: Gradient {
                        orientation: Gradient.Horizontal
                        GradientStop { position: 0.0; color: "#ffffff" }
                        GradientStop { position: 1.0; color: colorDialog.hslToColor(colorDialog.hue, 1.0, 0.5) }
                    }

                    Rectangle {
                        anchors.fill: parent
                        gradient: Gradient {
                            orientation: Gradient.Vertical
                            GradientStop { position: 0.0; color: "#00000000" }
                            GradientStop { position: 1.0; color: "#000000" }
                        }
                    }

                    MouseArea {
                        anchors.fill: parent
                        onPressed: function(mouse) {
                            colorDialog.saturation = mouse.x / width
                            colorDialog.lightness = 1 - (mouse.y / height)
                            colorDialog.updateColorFromHSL()
                        }
                        onPositionChanged: function(mouse) {
                            if (pressed) {
                                colorDialog.saturation = Math.max(0, Math.min(1, mouse.x / width))
                                colorDialog.lightness = Math.max(0, Math.min(1, 1 - (mouse.y / height)))
                                colorDialog.updateColorFromHSL()
                            }
                        }
                    }

                    // Selection indicator
                    Rectangle {
                        x: colorDialog.saturation * parent.width - 5
                        y: (1 - colorDialog.lightness) * parent.height - 5
                        width: 10
                        height: 10
                        radius: 5
                        border.color: "#ffffff"
                        border.width: 2
                        color: "transparent"
                    }
                }
            }

            // Hue slider
            RowLayout {
                Layout.fillWidth: true
                spacing: 12

                Text {
                    text: "Hue:"
                    color: themeManager.textColor
                    font.pixelSize: 14
                    Layout.preferredWidth: 50
                }

                Rectangle {
                    Layout.fillWidth: true
                    Layout.preferredHeight: 30
                    radius: 4

                    gradient: Gradient {
                        orientation: Gradient.Horizontal
                        GradientStop { position: 0.0; color: "#ff0000" }
                        GradientStop { position: 0.166; color: "#ffff00" }
                        GradientStop { position: 0.333; color: "#00ff00" }
                        GradientStop { position: 0.5; color: "#00ffff" }
                        GradientStop { position: 0.666; color: "#0000ff" }
                        GradientStop { position: 0.833; color: "#ff00ff" }
                        GradientStop { position: 1.0; color: "#ff0000" }
                    }

                    MouseArea {
                        anchors.fill: parent
                        onPressed: function(mouse) {
                            colorDialog.hue = (mouse.x / width) * 360
                            colorDialog.updateColorFromHSL()
                        }
                        onPositionChanged: function(mouse) {
                            if (pressed) {
                                colorDialog.hue = Math.max(0, Math.min(360, (mouse.x / width) * 360))
                                colorDialog.updateColorFromHSL()
                            }
                        }
                    }

                    Rectangle {
                        x: (colorDialog.hue / 360) * parent.width - 2
                        y: -2
                        width: 4
                        height: parent.height + 4
                        color: "#ffffff"
                        border.color: "#000000"
                        border.width: 1
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
                    id: hexInput
                    Layout.fillWidth: true
                    text: colorDialog.currentColor.toString()
                    color: themeManager.textColor

                    background: Rectangle {
                        color: themeManager.inputBackground
                        border.color: themeManager.borderColor
                        border.width: 1
                        radius: 4
                    }

                    onEditingFinished: {
                        if (text.match(/^#[0-9A-Fa-f]{6}$/)) {
                            colorDialog.currentColor = text
                        }
                    }
                }
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
                        Layout.preferredHeight: 40
                        color: modelData
                        radius: 4
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

    // Global CSV Drag-and-Drop Overlay
    DropArea {
        id: globalDropArea
        anchors.fill: parent

        property bool isDraggingCsv: false
        property bool isDraggingImage: false

        function isImageFile(url) {
            var urlStr = url.toString().toLowerCase()
            // Check for explicit image extensions
            if (urlStr.endsWith('.png') || urlStr.endsWith('.jpg') ||
                urlStr.endsWith('.jpeg') || urlStr.endsWith('.gif') ||
                urlStr.endsWith('.bmp') || urlStr.endsWith('.tiff')) {
                return true
            }
            // Check for image formats (like screenshots) that might not have extensions
            // These often have "image" in the mime type or URL
            if (urlStr.includes('image') || urlStr.includes('screenshot')) {
                return true
            }
            // Check for macOS screenshot naming pattern: "Screenshot YYYY-MM-DD at H.MM.SS AM/PM"
            // Extract just the filename from the URL path
            var filename = urlStr.split('/').pop()
            if (filename.startsWith('screenshot ') && filename.match(/\d{4}-\d{2}-\d{2}/)) {
                return true
            }
            return false
        }

        onEntered: function(drag) {
            if (drag.hasUrls) {
                var url = drag.urls[0].toString().toLowerCase()
                if (url.endsWith('.csv')) {
                    isDraggingCsv = true
                    drag.accept(Qt.CopyAction)
                } else if (isImageFile(drag.urls[0])) {
                    // Check if we're over the notes area
                    if (notesEntryContainer && notesEntryContainer.visible) {
                        isDraggingImage = true
                        drag.accept(Qt.CopyAction)
                        console.log("Notes container position:", notesEntryContainer.mapToItem(null, 0, 0))
                        console.log("Notes container size:", notesEntryContainer.width, "x", notesEntryContainer.height)
                    }
                }
            }
        }

        onExited: {
            isDraggingCsv = false
            isDraggingImage = false
        }

        onDropped: function(drop) {
            if (drop.hasUrls && drop.urls.length > 0) {
                var filePath = drop.urls[0]
                var filePathStr = filePath.toString().toLowerCase()

                if (filePathStr.endsWith('.csv')) {
                    isDraggingCsv = false
                    backend.importCSV(filePath)
                    drop.accept(Qt.CopyAction)
                } else if (isImageFile(drop.urls[0])) {
                    isDraggingImage = false
                    // Add all image files
                    for (var i = 0; i < drop.urls.length; i++) {
                        if (isImageFile(drop.urls[i])) {
                            backend.addAttachment(drop.urls[i].toString())
                        }
                    }
                    drop.accept(Qt.CopyAction)
                }
            }
        }

        // Dark overlay with message for CSV
        Rectangle {
            anchors.fill: parent
            color: "#000000"
            opacity: globalDropArea.isDraggingCsv ? 0.8 : 0
            visible: opacity > 0

            Behavior on opacity {
                NumberAnimation { duration: 200 }
            }

            ColumnLayout {
                anchors.centerIn: parent
                spacing: 20

                Text {
                    text: "📄"
                    font.pixelSize: 72
                    color: "#ffffff"
                    Layout.alignment: Qt.AlignHCenter
                }

                Text {
                    text: "Import CSV"
                    font.pixelSize: 36
                    font.bold: true
                    color: "#ffffff"
                    Layout.alignment: Qt.AlignHCenter
                }

                Text {
                    text: "Drop your CSV file here"
                    font.pixelSize: 18
                    color: "#cccccc"
                    Layout.alignment: Qt.AlignHCenter
                }
            }
        }

        // Overlay with message for images - limited to notes area only
        Rectangle {
            id: imageOverlay

            x: 0
            y: 0
            width: 0
            height: 0
            color: "#000000"
            opacity: globalDropArea.isDraggingImage ? 0.8 : 0
            visible: opacity > 0
            radius: 6

            Behavior on opacity {
                NumberAnimation { duration: 200 }
            }

            onVisibleChanged: {
                if (visible && notesEntryContainer) {
                    var pos = notesEntryContainer.mapToItem(null, 0, 0)
                    x = pos.x
                    y = pos.y
                    width = notesEntryContainer.width
                    height = notesEntryContainer.height
                    console.log("Image overlay updated to:", x, y, "size:", width, height)
                }
            }

            Text {
                anchors.centerIn: parent
                text: "Drop image to attach to notes"
                font.pixelSize: 18
                font.bold: true
                color: "#ffffff"
            }
        }
    }
}
