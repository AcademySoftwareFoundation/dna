try:
    from PySide2 import QtCore, QtWidgets, QtGui
except ImportError:
    from PySide6 import QtCore, QtGui, QtWidgets

class EyeDropper(QtWidgets.QWidget):
    SIG_EYE_DROPPER_ENABLED = QtCore.Signal(bool)
    SIG_EYE_DROPPER_SIZE_NAME_CHANGED = QtCore.Signal(str)

    def __init__(self):
        super().__init__()
        self.__eye_drop_button = QtWidgets.QToolButton()
        self.__eye_drop_button.setToolTip("Eye dropper")
        self.__eye_drop_button.setCheckable(True)
        self.__eye_drop_button.setFocusPolicy(QtCore.Qt.NoFocus)
        self.__eye_drop_button.setIcon(
            QtGui.QIcon(QtGui.QPixmap(':dropper16.png'))
            )
        self.__eye_drop_button.setIconSize(QtCore.QSize(30, 30))

        self.__sample_size = QtWidgets.QComboBox()
        self.__sample_size.setToolTip('Set eye dropper sample size')
        self.__sample_size.setFocusPolicy(QtCore.Qt.NoFocus)

        layout = QtWidgets.QHBoxLayout()
        layout.addWidget(self.__eye_drop_button)
        layout.addWidget(self.__sample_size)

        self.setLayout(layout)

        self.__eye_drop_button.clicked.connect(self.SIG_EYE_DROPPER_ENABLED)
        self.__sample_size.currentIndexChanged.connect(
            lambda: self.SIG_EYE_DROPPER_SIZE_NAME_CHANGED.emit(
                self.__sample_size.currentText()
            )
        )

    def enable_eye_dropper(self, enable):
        self.__eye_drop_button.setChecked(enable)

    def set_eye_dropper_sample_size(self, index):
        self.__sample_size.setCurrentIndex(index)

    def set_eye_dropper_sample_sizes(self, sample_sizes):
        self.__sample_size.addItems(sample_sizes)
