try:
    from PySide2 import QtCore, QtGui, QtWidgets
except ImportError:
    from PySide6 import QtCore, QtGui, QtWidgets
from string import Template
from widgets.color_picker.view import qcolor
from widgets.color_picker.view.color_sliders.double_slider import DoubleSlider


class DoubleSpinBox(QtWidgets.QDoubleSpinBox):
    SIG_ENTER_KEY_PRESSED = QtCore.Signal(float)
    SIG_STEP_BY = QtCore.Signal(float)

    def __init__(self):
        super().__init__()

    def keyPressEvent(self, event):
        if event.key() == QtCore.Qt.Key_Return or event.key() == QtCore.Qt.Key_Enter:
            self.SIG_ENTER_KEY_PRESSED.emit(self.value())
        else:
            super().keyPressEvent(event)

    def stepBy(self, steps):
        self.SIG_STEP_BY.emit(self.value())
        super().stepBy(steps)


class ColorSlider(QtWidgets.QWidget):
    SIG_SLIDER_VALUE_CHANGED = QtCore.Signal(float)
    SIG_SLIDER_END_COLOR_CHANGED = QtCore.Signal(float, float, float)
    SLIDER_STYLESHEET_TEMPLATE = Template(
        """
        QSlider::groove:horizontal {
            background: qlineargradient(x1: 0, y1:0, x2: 1, y2: 0, stop: 0 $start_color, stop: 1 $end_color);
            height: 20px;
        }

        QSlider::handle:horizontal {
            background-color: $slider_color;
            height: 16px;
            width: 6px;
        }
        """
    )

    def __init__(
        self, minimum=-1.0, maximum=1.0, interval=0.01, name=None, decimals=3,
        start_color=qcolor.WHITE, end_color=qcolor.BLACK,
        slider_color=qcolor.GOLDEN_ROD, parent=None
    ):
        super().__init__(parent)

        self.__layout = QtWidgets.QHBoxLayout()

        self.__minimum = minimum
        self.__maximum = maximum
        self.interval = interval
        self.decimals = decimals
        self.name = name
        self.start_color = start_color
        self.end_color = end_color
        self.slider_color = slider_color

        self.__setupInput()
        self.__setupSlider()

        self.setLayout(self.__layout)


    def __getHsvColorString(self, color):
        return 'hsv({0},{1},{2})'.format(color.hslHue(), '100%', '100%')

    def __getRgbColorString(self, color):
        return 'rgb({0},{1},{2})'.format(color.red(), color.green(), color.blue())

    def set_end_color(self, rgb):
        self.end_color = QtGui.QColor()
        self.end_color.setRgbF(rgb.red, rgb.green, rgb.blue)
        stylesheet = ColorSlider.SLIDER_STYLESHEET_TEMPLATE.safe_substitute(
            start_color = self.__getRgbColorString(self.start_color),
            end_color = self.__getHsvColorString(self.end_color),
            slider_color = self.__getRgbColorString(self.slider_color),
            )
        self.__updateSliderStyleSheet(stylesheet)

    def __updateSliderStyleSheet(self, stylesheet):
        self.__slider.setStyleSheet(stylesheet)

    def __setupInput(self):
        self.__input = DoubleSpinBox()
        self.__input.setDecimals(self.decimals)
        self.__input.setFixedSize(75, 25)
        self.__input.setRange(self.__minimum, self.__maximum)
        self.__input.setValue(0)
        self.__input.SIG_ENTER_KEY_PRESSED.connect(self.__inputValueChanged)
        self.__input.SIG_STEP_BY.connect(self.__inputValueChanged)
        self.__layout.addWidget(self.__input)

    def __setupSlider(self):
        decimal_places = 3
        self.__slider = DoubleSlider(decimal_places, QtCore.Qt.Horizontal)
        self.__slider.setFocusPolicy(QtCore.Qt.NoFocus)
        self.__slider.setMinimum(self.__minimum)
        self.__slider.setMaximum(self.__maximum)
        self.__slider.setValue(0)
        self.__slider.SIG_DOUBLE_VALUE_CHANGED.connect(self.__sliderValueChanged)

        # Set slider background
        self.__slider.setAttribute(QtCore.Qt.WA_StyledBackground, True)
        stylesheet = self.__getSliderStyleSheet()
        self.__updateSliderStyleSheet(stylesheet)

        self.__layout.addWidget(self.__slider)

    def __getSliderStyleSheet(self):
        return ColorSlider.SLIDER_STYLESHEET_TEMPLATE.safe_substitute(
            start_color = self.__getRgbColorString(self.start_color),
            end_color = self.__getRgbColorString(self.end_color),
            slider_color = self.__getRgbColorString(self.slider_color),
        )

    @QtCore.Slot(object)
    def __sliderValueChanged(self, value):
        self.__input.blockSignals(True)
        self.__input.setValue(value)
        self.__input.blockSignals(False)
        self.SIG_SLIDER_VALUE_CHANGED.emit(value)

    @QtCore.Slot(object)
    def __inputValueChanged(self, value):
        self.__slider.blockSignals(True)
        self.__slider.setValue(self.__input.value())
        self.__slider.blockSignals(False)
        self.SIG_SLIDER_VALUE_CHANGED.emit(value)

    def getValue(self):
        return float(self.__slider.value())

    def setValue(self, value, reset=False):
        self.__slider.blockSignals(True)
        self.__slider.setValue(value)
        self.__slider.blockSignals(False)

        self.__input.blockSignals(True)
        self.__input.setValue(value)
        self.__input.blockSignals(False)
        if reset:
            self.SIG_SLIDER_VALUE_CHANGED.emit(value)

    def set_single_step(self, delta):
        self.__slider.setSingleStep(delta)
        self.__input.setSingleStep(delta)

    def reset(self):
        self.setValue(0, reset=True)
