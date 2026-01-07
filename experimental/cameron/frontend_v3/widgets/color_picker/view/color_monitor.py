try:
    from PySide2 import QtCore, QtGui, QtWidgets
except ImportError:
    from PySide6 import QtCore, QtGui, QtWidgets
from widgets.color_picker.model import Rgb


class ColorMonitor(QtWidgets.QWidget):
    SIG_SET_CURRENT_COLOR = QtCore.Signal(object)

    def __init__(self, parent=None):
        super().__init__(parent)
        self.__current_color = QtGui.QColor()
        self.__current_color.setRgbF(0.0, 0.0, 0.0)

        self.__starting_color = QtGui.QColor()
        self.__starting_color.setRgbF(0.0, 0.0, 0.0)

        size = 80
        self.__current_square = QtCore.QRect(0, 0, size/2, size/2)
        self.__starting_square = QtCore.QRect(size/2, 0, size/2, size/2)

        self.setMinimumSize(80, 40)

    def paintEvent(self, event):
        p = QtGui.QPainter(self)
        p.setPen(QtCore.Qt.transparent)
        p.setBrush(self.__current_color)
        p.drawRect(self.__current_square)
        p.setBrush(self.__starting_color)
        p.drawRect(self.__starting_square)

    def processMouseEvent(self, event):
        if not self.__starting_square.contains(event.x(), event.y()):
            return
        self.__current_color.setRgbF(
            self.__starting_color.redF(),
            self.__starting_color.greenF(),
            self.__starting_color.blueF()
        )
        self.repaint()
        self.SIG_SET_CURRENT_COLOR.emit(
            Rgb(
                self.__current_color.redF(),
                self.__current_color.greenF(),
                self.__current_color.blueF()
            )
        )

    def mousePressEvent(self, event):
        self.processMouseEvent(event)

    def set_current_color(self, rgb):
        self.__current_color.setRgbF(*rgb.get())
        self.repaint()

    def set_starting_color(self, rgb):
        self.__starting_color.setRgbF(*rgb.get())
        self.repaint()
