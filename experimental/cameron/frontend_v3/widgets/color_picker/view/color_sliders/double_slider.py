try:
    from PySide2 import QtCore, QtGui, QtWidgets
except ImportError:
    from PySide6 import QtCore, QtGui, QtWidgets


class DoubleSlider(QtWidgets.QSlider):
    # https://stackoverflow.com/questions/42820380/use-float-for-qslider

    SIG_DOUBLE_VALUE_CHANGED = QtCore.Signal(float)

    def __init__(self, decimals=3, *args, **kargs):
        super().__init__( *args, **kargs)
        self.__decimal_places = 10 ** decimals
        self.valueChanged.connect(self.emitDoubleValueChanged)

    def emitDoubleValueChanged(self):
        value = float(super().value())/self.__decimal_places
        self.SIG_DOUBLE_VALUE_CHANGED.emit(value)

    def value(self):
        return float(super().value()) / self.__decimal_places

    def setMinimum(self, value):
        return super().setMinimum(value * self.__decimal_places)

    def setMaximum(self, value):
        return super().setMaximum(value * self.__decimal_places)

    def setSingleStep(self, value):
        return super().setSingleStep(value * self.__decimal_places)

    def singleStep(self):
        return float(super().singleStep()) / self.__decimal_places

    def setValue(self, value):
        super().setValue(int(value * self.__decimal_places))

    def mousePressEvent(self, event):
        if event.button() == QtCore.Qt.LeftButton:
            event.accept()
            event = QtGui.QMouseEvent(
                QtCore.QEvent.MouseButtonPress,
                event.pos(), QtCore.Qt.MiddleButton,
                QtCore.Qt.MiddleButton, QtCore.Qt.NoModifier
            )
        super().mousePressEvent(event)

    def mouseReleaseEvent(self, event):
        super().mouseReleaseEvent(event)
