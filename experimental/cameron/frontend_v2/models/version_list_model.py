"""
Version List Model
Qt model for displaying version list
"""

from PySide6.QtCore import QAbstractListModel, Qt, QModelIndex


class VersionListModel(QAbstractListModel):
    """Model for version list"""

    # Define roles
    VersionIdRole = Qt.UserRole + 1
    DescriptionRole = Qt.UserRole + 2

    def __init__(self, backend_service, parent=None):
        super().__init__(parent)
        self._backend = backend_service
        self._versions = []

        # Connect to backend signal
        self._backend.versionsLoaded.connect(self.load_versions)

        self.load_versions()

    def load_versions(self):
        """Load versions from backend"""
        self.beginResetModel()
        self._versions = self._backend.fetch_versions()
        self.endResetModel()

    def rowCount(self, parent=QModelIndex()):
        """Return number of versions"""
        return len(self._versions)

    def data(self, index, role=Qt.DisplayRole):
        """Return data for given index and role"""
        if not index.isValid() or index.row() >= len(self._versions):
            return None

        version = self._versions[index.row()]

        if role == self.VersionIdRole:
            return version.get("id")
        elif role == self.DescriptionRole:
            return version.get("description", "")

        return None

    def roleNames(self):
        """Return role names for QML access"""
        return {
            self.VersionIdRole: b"versionId",
            self.DescriptionRole: b"description",
        }
