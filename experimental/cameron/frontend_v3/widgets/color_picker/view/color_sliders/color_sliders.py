try:
    from PySide2 import QtCore, QtGui, QtWidgets
except ImportError:
    from PySide6 import QtCore, QtGui, QtWidgets
from widgets.color_picker.view import qcolor
from widgets.color_picker.view.color_sliders.color_slider import ColorSlider
from widgets.color_picker.view.color_sliders.clearing_slider_label import ClearingSliderLabel


class ColorSliders(QtWidgets.QWidget):
    TEMPERATURE_START_COLOR = QtGui.QColor(246.0, 192.0, 67.0)
    TEMPERATURE_END_COLOR = QtGui.QColor(156.0, 203.0, 248.0)
    MAGENTA_START_COLOR = QtGui.QColor(0, 255.0, 0)
    MAGENTA_END_COLOR = QtGui.QColor(255.0, 0, 255.0)

    SIG_RED_SLIDER_CHANGED = QtCore.Signal(float)
    SIG_GREEN_SLIDER_CHANGED = QtCore.Signal(float)
    SIG_BLUE_SLIDER_CHANGED = QtCore.Signal(float)
    SIG_TEMPERATURE_SLIDER_CHANGED = QtCore.Signal(float)
    SIG_MAGENTA_SLIDER_CHANGED = QtCore.Signal(float)
    SIG_INTENSITY_SLIDER_CHANGED = QtCore.Signal(float)
    SIG_SATURATION_SLIDER_CHANGED = QtCore.Signal(float)

    SIG_SLIDER_END_COLOR_CHANGED = QtCore.Signal(float, float, float)

    def __init__(self, parent=None):
        super().__init__(parent)

        self.__intensity = ColorSlider(
            minimum=0.0,
            name='intensity',
            start_color=qcolor.BLACK,
            end_color=qcolor.WHITE,
            slider_color=qcolor.GOLDEN_ROD,
            )
        label_intensity = ClearingSliderLabel("I", tooltip="Intensity")
        label_intensity.SIG_RESET_SLIDER.connect(self.__intensity.reset)

        self.__temperature = ColorSlider(
            name='temperature',
            start_color=ColorSliders.TEMPERATURE_START_COLOR,
            end_color=ColorSliders.TEMPERATURE_END_COLOR,
            slider_color=qcolor.BLACK,
        )
        label_temperature = ClearingSliderLabel("T", tooltip="Temperature")
        label_temperature.SIG_RESET_SLIDER.connect(self.__temperature.reset)

        self.__magenta = ColorSlider(
            name='magenta',
            start_color=ColorSliders.MAGENTA_START_COLOR,
            end_color=ColorSliders.MAGENTA_END_COLOR,
            slider_color=qcolor.BLACK,
        )
        label_magenta = ClearingSliderLabel("M", tooltip="Magenta")
        label_magenta.SIG_RESET_SLIDER.connect(self.__magenta.reset)

        self.__red = ColorSlider(
            minimum=0,
            maximum=1.0,
            interval=0.01,
            decimals=2,
            name='red',
            start_color=qcolor.BLACK,
            end_color=qcolor.RED,
            slider_color=qcolor.GOLDEN_ROD,
        )
        label_red = ClearingSliderLabel("R", tooltip="Red")
        label_red.SIG_RESET_SLIDER.connect(self.__red.reset)

        self.__green = ColorSlider(
            minimum=0,
            maximum=1.0,
            interval=0.01,
            decimals=2,
            name='green',
            start_color=qcolor.BLACK,
            end_color=qcolor.GREEN,
            slider_color=qcolor.GOLDEN_ROD,
        )
        label_green = ClearingSliderLabel("G", tooltip="Green")
        label_green.SIG_RESET_SLIDER.connect(self.__green.reset)

        self.__blue = ColorSlider(
            minimum=0,
            maximum=1.0,
            interval=0.01,
            decimals=2,
            name='blue',
            start_color=qcolor.BLACK,
            end_color=qcolor.BLUE,
            slider_color=qcolor.GOLDEN_ROD,
        )
        label_blue = ClearingSliderLabel("B", tooltip="Blue")
        label_blue.SIG_RESET_SLIDER.connect(self.__blue.reset)

        self.__saturation = ColorSlider(
            minimum=0,
            maximum=1.0,
            interval=0.01,
            decimals=2,
            name='saturation',
            start_color=qcolor.WHITE,
            end_color=qcolor.BLACK,
            slider_color=qcolor.GOLDEN_ROD,
        )
        label_saturation = ClearingSliderLabel("S", tooltip="Saturation")
        label_saturation.SIG_RESET_SLIDER.connect(self.__saturation.reset)

        layout = QtWidgets.QGridLayout()
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)

        layout.addWidget(label_intensity , 0, 0)
        layout.addWidget(self.__intensity, 0, 1)
        layout.addWidget(label_temperature, 1, 0)
        layout.addWidget(self.__temperature, 1, 1)
        layout.addWidget(label_magenta, 2, 0)
        layout.addWidget(self.__magenta, 2, 1)
        layout.addWidget(label_red, 3, 0)
        layout.addWidget(self.__red, 3, 1)
        layout.addWidget(label_green, 4, 0)
        layout.addWidget(self.__green, 4, 1)
        layout.addWidget(label_blue, 5, 0)
        layout.addWidget(self.__blue, 5, 1)
        layout.addWidget(label_saturation, 6, 0)
        layout.addWidget(self.__saturation, 6, 1)

        self.setLayout(layout)

        self.__red.SIG_SLIDER_VALUE_CHANGED.connect(self.SIG_RED_SLIDER_CHANGED)
        self.__green.SIG_SLIDER_VALUE_CHANGED.connect(self.SIG_GREEN_SLIDER_CHANGED)
        self.__blue.SIG_SLIDER_VALUE_CHANGED.connect(self.SIG_BLUE_SLIDER_CHANGED)
        self.__temperature.SIG_SLIDER_VALUE_CHANGED.connect(self.SIG_TEMPERATURE_SLIDER_CHANGED)
        self.__magenta.SIG_SLIDER_VALUE_CHANGED.connect(self.SIG_MAGENTA_SLIDER_CHANGED)
        self.__intensity.SIG_SLIDER_VALUE_CHANGED.connect(self.SIG_INTENSITY_SLIDER_CHANGED)
        self.__saturation.SIG_SLIDER_VALUE_CHANGED.connect(self.SIG_SATURATION_SLIDER_CHANGED)

        self.SIG_SLIDER_END_COLOR_CHANGED.connect(self.__saturation.SIG_SLIDER_END_COLOR_CHANGED)

    def set_current_red(self, value):
        self.__red.setValue(value)

    def set_current_green(self, value):
        self.__green.setValue(value)

    def set_current_blue(self, value):
        self.__blue.setValue(value)

    def set_current_temperature(self, value):
        self.__temperature.setValue(value)

    def set_current_magenta(self, value):
        self.__magenta.setValue(value)

    def set_current_intensity(self, value):
        self.__intensity.setValue(value)

    def set_current_saturation(self, value):
        self.__saturation.setValue(value)

    def set_saturation_end_color(self, rgb):
        self.__saturation.set_end_color(rgb)

    def set_color_slider_delta(self, delta):
        self.__red.set_single_step(delta)
        self.__green.set_single_step(delta)
        self.__blue.set_single_step(delta)
        self.__temperature.set_single_step(delta)
        self.__magenta.set_single_step(delta)
        self.__intensity.set_single_step(delta)
        self.__saturation.set_single_step(delta)
