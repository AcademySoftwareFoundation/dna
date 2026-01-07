try:
    from PySide2 import QtCore, QtGui, QtWidgets
except ImportError:
    from PySide6 import QtCore, QtGui, QtWidgets


class Rgb(object):

    def __init__(self, red, green, blue):
        self.red = red
        self.green = green
        self.blue = blue

    def update(self, red, green, blue):
        self.red = red
        self.green = green
        self.blue = blue

    def get(self):
        return self.red, self.green, self.blue

    def get_copy(self):
        return Rgb(self.red, self.green, self.blue)

    def __eq__(self, other):
        if self.red == other.red and \
            self.green == other.green and \
            self.blue == other.blue:
            return True
        return False

# Code taken from https://gist.github.com/tobi08151405/7b0a8151c9df1a41a87c1559dac1243a
class ColorCircle(QtWidgets.QWidget):
    SIG_COLOR_CHANGED = QtCore.Signal(object)
    SIG_CONSTRAINT_HV = QtCore.Signal(bool)

    def __init__(self, parent=None, startupcolor=[255, 255, 255], margin=10, size=270):
        super().__init__(parent=parent)
        self.radius = 0
        self.selected_color = QtGui.QColor(*startupcolor)
        self.x = 0.5
        self.y = 0.5
        self.h = self.selected_color.hueF()
        self.s = self.selected_color.saturationF()
        self.v = self.selected_color.valueF()
        self.margin = margin

        self.__constraint_saturation = False

        qsp = QtWidgets.QSizePolicy(QtWidgets.QSizePolicy.Preferred,
                          QtWidgets.QSizePolicy.Preferred)
        qsp.setHeightForWidth(True)
        self.setSizePolicy(qsp)
        self.setMinimumSize(size, size)
        self.setMaximumSize(350, 350)
        self.setCursor(QtCore.Qt.PointingHandCursor)

        self.__hv_constraint = False
        self.SIG_CONSTRAINT_HV.connect(self.__setHueValueConstraintFlag)

    @QtCore.Slot(bool)
    def __setHueValueConstraintFlag(self, constraint):
        self.__hv_constraint = constraint

    def resizeEvent(self, ev):
        size = min(self.width(), self.height()) - self.margin * 2
        self.radius = size / 2
        self.outer_radius = (size + 40) / 2
        self.square = QtCore.QRect(0, 0, size, size)
        self.outer_square = QtCore.QRect(0, 0, size + 40, size + 40)
        self.outer_square.moveCenter(self.rect().center())
        self.square.moveCenter(self.rect().center())

    def paintEvent(self, ev):
        center = QtCore.QPointF(self.width()/2, self.height()/2)
        p = QtGui.QPainter(self)
        p.setRenderHint(QtGui.QPainter.Antialiasing)
        p.setViewport(self.margin, self.margin, self.width() -
                      2*self.margin, self.height()-2*self.margin)
        hsv_grad = QtGui.QConicalGradient(center, 90)
        outer_hsv_grad = QtGui.QConicalGradient(center, 90)

        for deg in range(360):
            col = QtGui.QColor.fromHsvF(float(deg / 360.0), 1.0, self.v)
            hsv_grad.setColorAt(float(deg / 360.0), col)

            outer_col = QtGui.QColor.fromHsvF(float(deg / 360.0), 1.0, 1.0)
            outer_hsv_grad.setColorAt(float(deg / 360.0), outer_col)

        val_grad = QtGui.QRadialGradient(center, self.radius)
        val_grad.setColorAt(0.0, QtGui.QColor.fromHsvF(0.0, 0.0, self.v, 1.0))
        val_grad.setColorAt(1.0, QtCore.Qt.transparent)

        outer_val_grad = QtGui.QRadialGradient(center, self.outer_radius)
        outer_val_grad.setColorAt(0.0, QtGui.QColor.fromHsvF(0.0, 0.0, 0.0, 1.0))
        outer_val_grad.setColorAt(1.0, QtCore.Qt.transparent)

        # Outer circle with constant V
        p.setPen(QtCore.Qt.transparent)
        p.setBrush(outer_hsv_grad)
        p.drawEllipse(self.outer_square)
        p.setBrush(outer_val_grad)
        p.drawEllipse(self.outer_square)

        # Inner circle with variable V
        p.setPen(QtCore.Qt.transparent)
        p.setBrush(hsv_grad)
        p.drawEllipse(self.square)
        p.setBrush(val_grad)
        p.drawEllipse(self.square)

        # Inner color selection circle
        p.setPen(QtCore.Qt.black)
        p.setBrush(QtGui.QColor(255.0, 255.0, 255.0))
        line = QtCore.QLineF.fromPolar(self.radius * self.s, 360 * self.h + 90)
        line.translate(self.rect().center())
        p.drawEllipse(line.p2(), 5, 5)

        # Outer color selection triangle
        line_inner = QtCore.QLineF.fromPolar(self.outer_radius - 10, 360 * self.h + 90)
        line_inner.translate(self.rect().center())
        l1 = QtCore.QLineF.fromPolar(self.outer_radius, 360 * self.h + 90 + 3)
        l1.translate(self.rect().center())
        l2 = QtCore.QLineF.fromPolar(self.outer_radius, 360 * self.h + 90 - 3)
        l2.translate(self.rect().center())
        p.drawPolygon(
            QtGui.QPolygonF([
                line_inner.p2(),
                l1.p2(),
                l2.p2()
            ])
        )

        # Cross-hair in the center of color circle
        p.setPen(QtCore.Qt.black)
        p.setBrush(QtGui.QColor(0.0, 0.0, 0.0))
        center_x = self.rect().center().x()
        center_y = self.rect().center().y()
        p.drawLine(QtCore.QLineF(center_x - 3, center_y, center_x + 3, center_y))
        p.drawLine(QtCore.QLineF(center_x, center_y - 3, center_x, center_y + 3))

    def recalc(self):
        self.selected_color.setHsvF(self.h, self.s, self.v)
        self.SIG_COLOR_CHANGED.emit(
            Rgb(
                self.selected_color.redF(),
                self.selected_color.greenF(),
                self.selected_color.blueF()
            )
        )
        self.repaint()

    def map_color(self, x, y):
        line = QtCore.QLineF(QtCore.QPointF(self.rect().center()), QtCore.QPointF(x, y))
        # Only move outer triangle unless cursor is clicked/dragged inside inner circle
        if line.length() < self.radius:
            if self.__constraint_saturation:
                s = self.s
            else:
                s = float(min(1.0, line.length() / self.radius))
        else:
            self.__constraint_saturation = True
            s = self.s

        if not self.__hv_constraint:
            h = (line.angle() - 90.0) / 360.0 % 1.
            return h, s, self.v
        else:
            return self.h, s, self.v

    def processMouseEvent(self, ev):
        if ev.button() == QtCore.Qt.RightButton:
            self.h, self.s, self.v = 0, 0, 0
        else:
            self.h, self.s, self.v = self.map_color(ev.x(), ev.y())
        self.x = ev.x() / self.width()
        self.y = ev.y() / self.height()
        self.recalc()

    def mouseMoveEvent(self, ev):
        self.processMouseEvent(ev)

    def mousePressEvent(self, ev):
        self.processMouseEvent(ev)

    def mouseReleaseEvent(self, ev):
        self.__constraint_saturation = False
        super().mouseReleaseEvent(ev)

    def setHue(self, hue):
        if 0 <= hue <= 1:
            self.h = float(hue)
            self.recalc()
        else:
            raise TypeError("Value must be between 0.0 and 1.0")

    def setSaturation(self, saturation):
        if 0 <= saturation <= 1:
            self.s = float(saturation)
            self.recalc()
        else:
            raise TypeError("Value must be between 0.0 and 1.0")

    def setValue(self, value):
        if 0 <= value <= 1:
            self.v = float(value)
            self.recalc()
        else:
            raise TypeError("Value must be between 0.0 and 1.0")

    def setColor(self, rgb):
        q_color = QtGui.QColor()
        q_color.setRgbF(rgb.red, rgb.green, rgb.blue)
        self.h = q_color.hueF()
        self.s = q_color.saturationF()
        self.v = q_color.valueF()
        self.recalc()

    def getHue(self):
        return self.h

    def getSaturation(self):
        return self.s

    def getValue(self):
        return self.v

    def getColor(self):
        return self.selected_color
