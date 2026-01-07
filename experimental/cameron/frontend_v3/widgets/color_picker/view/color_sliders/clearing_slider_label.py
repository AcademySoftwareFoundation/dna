try:
    from PySide2 import QtCore, QtGui, QtWidgets
except ImportError:
    from PySide6 import QtCore, QtGui, QtWidgets


class ClearingSliderLabel(QtWidgets.QPushButton):
    SIG_RESET_SLIDER = QtCore.Signal()

    def __init__(self, title, tooltip=None, parent=None):
        super().__init__(title, parent)
        if tooltip is not None:
            self.setToolTip(tooltip)

        self.setFixedSize(20, 20)
        self.setFocusPolicy(QtCore.Qt.NoFocus)
        self.setStyleSheet("QPushButton {color: rgb(192, 158, 64);}")
        self.setCursor(QtCore.Qt.PointingHandCursor)

    def mousePressEvent(self, event):
        self.SIG_RESET_SLIDER.emit()
