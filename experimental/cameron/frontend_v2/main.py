#!/usr/bin/env python3
"""
DNA Dailies Notes Assistant - Qt Desktop Application
Main entry point
"""

import sys
from pathlib import Path
from PySide6.QtGui import QGuiApplication
from PySide6.QtQml import QQmlApplicationEngine
from PySide6.QtCore import QUrl

# Import our custom components
from models.version_list_model import VersionListModel
from services.backend_service import BackendService


def main():
    """Main application entry point"""
    app = QGuiApplication(sys.argv)
    app.setOrganizationName("DNA")
    app.setApplicationName("Dailies Notes Assistant")

    engine = QQmlApplicationEngine()

    # Create backend service
    backend = BackendService()

    # Create version list model
    version_model = VersionListModel(backend)

    # Expose to QML
    engine.rootContext().setContextProperty("versionModel", version_model)
    engine.rootContext().setContextProperty("backend", backend)

    # Load main QML file
    qml_file = Path(__file__).parent / "ui" / "main.qml"
    engine.load(QUrl.fromLocalFile(str(qml_file)))

    if not engine.rootObjects():
        return -1

    return app.exec()


if __name__ == "__main__":
    sys.exit(main())
