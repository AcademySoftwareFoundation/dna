#!/usr/bin/env python3
"""
DNA Dailies Notes Assistant - Qt Desktop Application
Main entry point
"""

import sys
import os
from pathlib import Path

# Set Qt Quick Controls style to Basic BEFORE importing Qt
os.environ["QT_QUICK_CONTROLS_STYLE"] = "Basic"

# Import our custom components
from models.version_list_model import VersionListModel
from PySide6.QtCore import QUrl
from PySide6.QtQml import QQmlApplicationEngine
from PySide6.QtWidgets import QApplication
from services.backend_service import BackendService
from services.color_picker_service import ColorPickerService


def main():
    """Main application entry point"""
    app = QApplication(sys.argv)
    app.setOrganizationName("DNA")
    app.setApplicationName("Dailies Notes Assistant")

    engine = QQmlApplicationEngine()

    # Create backend service
    backend = BackendService()

    # Create version list model
    version_model = VersionListModel(backend)

    # Create color picker service
    color_picker_service = ColorPickerService()

    # Expose to QML
    engine.rootContext().setContextProperty("versionModel", version_model)
    engine.rootContext().setContextProperty("backend", backend)
    engine.rootContext().setContextProperty("colorPickerService", color_picker_service)

    # Load main QML file
    qml_file = Path(__file__).parent / "ui" / "main.qml"
    engine.load(QUrl.fromLocalFile(str(qml_file)))

    if not engine.rootObjects():
        return -1

    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
