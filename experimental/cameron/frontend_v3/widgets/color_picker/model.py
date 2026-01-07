"""
Model for Color Picker
"""

from collections import deque
try:
    from PySide2 import QtGui
except ImportError:
    from PySide6 import QtGui


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


class Rgbs(object):

    def __init__(self, rgb, saturation=None):
        red, green, blue = self.__clamp(rgb.red, rgb.green, rgb.blue)
        self.__q_color = QtGui.QColor()
        self.__q_color.setRgbF(red, green, blue)
        if saturation is not None:
            self.__q_color.setHsvF(
                self.__q_color.hueF(),
                saturation,
                self.__q_color.valueF()
            )

    def get(self):
        return self.__q_color.redF(), self.__q_color.greenF(), \
                self.__q_color.blueF(), self.__q_color.saturationF()

    def __clamp(self, red, green, blue):
        return [min(max(channel, 0.0), 1.0) for channel in (red, green, blue)]


class ColorConverter(object):

    @staticmethod
    def tmi_to_rgb(temperature, magenta, intensity):
        red = green = blue = 0

        if magenta == 0.0 and temperature == 0.0:
            red = green = blue = intensity
        else:
            green = ((3.0 * intensity) - (2.0 * magenta)) / 3.0
            red = ((6.0 * intensity) + (2.0 * magenta) - (3.0 * temperature)) / 6.0
            blue = red + temperature

        return Rgb(red, green, blue)

    @staticmethod
    def rgb_to_tmi(red, green, blue):
        temperature = blue - red
        magenta = (red + blue)/2.0 - green
        intensity = (red + green + blue)/3.0

        return temperature, magenta, intensity


class Color(object):

    def __init__(self, red, green, blue, saturation, temperature, magenta, intensity):
        self.red = red
        self.green = green
        self.blue = blue
        self.saturation = saturation
        self.temperature = temperature
        self.magenta = magenta
        self.intensity = intensity

    def update(self, red, green, blue, saturation, temperature, magenta, intensity):
        self.red = red
        self.green = green
        self.blue = blue
        self.saturation = saturation
        self.temperature = temperature
        self.magenta = magenta
        self.intensity = intensity

    def get_rgb(self):
        return self.red, self.green, self.blue

    def __repr__(self):
        return "(Red: {0} Green: {1} Blue:"\
        "{2} Temperature: {3} Magenta: {4} Intensity:"\
        "{5} Saturation: {6})".format(
            self.red, self.green, self.blue,
            self.temperature, self.magenta, self.intensity,
            self.saturation
        )

    def get_copy(self):
        return Color(
            self.red, self.green, self.blue, self.saturation,
            self.temperature, self.magenta, self.intensity
        )

    def get(self):
        return self.red, self.green, self.blue, self.saturation, \
            self.temperature, self.magenta, self.intensity

    def __eq__(self, other):
        if self.red == other.red and self.green == other.green and \
        self.blue == other.blue and self.saturation == other.saturation and \
        self.temperature == other.temperature and self.magenta == other.magenta and \
        self.intensity == other.intensity:
            return True
        return False


class EyeDropperSampleSize(object):

    def __init__(self, name, value):
        self.name = name
        self.value = value


class EyeDropperSampleSizes(object):

    def __init__(self, sizes):
        self.__name_index_map = {}
        self.__value_index_map = {}
        self.__current_index = 0
        self.__sizes = sizes

        for index, size in enumerate(self.__sizes):
            self.__name_index_map[size.name] = index
            self.__value_index_map[size.value] = index

    def set_current_size(self, value):
        index = self.__value_index_map.get(value)
        if index is None:
            return
        self.__current_index = index

    def get_current_size(self):
        return self.__sizes[self.__current_index].value

    def get_size_from_name(self, name):
        index = self.__name_index_map.get(name)
        if index is None:
            return
        return self.__sizes[index].value

    def get_size_names(self):
        return [size.name for size in self.__sizes]

    def get_current_index(self):
        return self.__current_index


class FavColor(object):
    DEFAULT_TOOL_TIP = "Hotkey not set!"

    def __init__(self, rgb, tool_tip=None):
        self.rgb = rgb
        if tool_tip is None:
            tool_tip = FavColor.DEFAULT_TOOL_TIP
        self.tool_tip = tool_tip


class ColorBuilder(object):

    @staticmethod
    def build(rgb):
        return Color(*ColorBuilder.build_args_with_rgb(rgb))

    @staticmethod
    def build_args_with_rgb(rgb):
        red, green, blue, saturation = Rgbs(rgb.get_copy()).get()
        temperature, magenta, intensity = ColorConverter.rgb_to_tmi(red, green, blue)

        return red, green, blue, saturation, temperature, magenta, intensity

    @staticmethod
    def build_args_with_tmi(temperature, magenta, intensity):
        return ColorBuilder.build_args_with_rgb(
            ColorConverter.tmi_to_rgb(temperature, magenta, intensity)
        )


class Model(object):

    def __init__(self):
        self.__current_color = ColorBuilder.build(Rgb(0.0, 0.0, 0.0))
        self.__color_in_use = Rgb(0.0, 0.0, 0.0)
        self.__saturation = 1.0
        max_num_of_recent_colors = 16
        self.__recent_colors = deque(
            [Rgb(1.0, 1.0, 1.0)] * max_num_of_recent_colors,
            maxlen=max_num_of_recent_colors
        )
        self.__is_recent_colors_empty = True
        max_num_of_fav_colors = 3
        self.__fav_colors = []
        for _ in range(max_num_of_fav_colors):
            self.__fav_colors.append(FavColor(Rgb(1.0, 1.0, 1.0)))
        self.__fav_tool_tip = []
        max_num_of_custom_colors = 13
        self.__custom_colors = deque(
            [Rgb(1.0, 1.0, 1.0)] * max_num_of_custom_colors,
            maxlen=max_num_of_custom_colors
        )
        self.__eye_dropper_enabled = False
        self.__eye_dropper_sample_sizes = EyeDropperSampleSizes([
            EyeDropperSampleSize("1x1", 1),
            EyeDropperSampleSize("3x3", 3),
            EyeDropperSampleSize("5x5", 5)
        ])
        self.__color_delta = 0.01

    def enable_eye_dropper(self, enable):
        self.__eye_dropper_enabled = enable

    def is_eye_dropper_enabled(self):
        return self.__eye_dropper_enabled

    def get_eye_dropper_sample_size_from_name(self, size_name):
        return self.__eye_dropper_sample_sizes.get_size_from_name(size_name)

    def get_eye_dropper_sample_size_index(self):
        return self.__eye_dropper_sample_sizes.get_current_index()

    def set_eye_dropper_sample_size(self, size):
        self.__eye_dropper_sample_sizes.set_current_size(size)

    def get_eye_dropper_sample_size_names(self):
        return self.__eye_dropper_sample_sizes.get_size_names()

    def get_eye_dropper_sample_size(self):
        return self.__eye_dropper_sample_sizes.get_current_size()

    def set_current_color(self, rgb):
        if self.__current_color.get_rgb() == rgb.get():
            return False
        self.__current_color.update(
            *ColorBuilder.build_args_with_rgb(rgb.get_copy())
        )
        self.set_recent_color(rgb.get_copy())
        return True

    def get_current_color(self):
        return self.__current_color.get_copy()

    def set_color_in_use(self, rgb):
        if self.__color_in_use == rgb:
            return False
        self.__color_in_use.update(*rgb.get())
        return True

    def get_color_in_use(self):
        return self.__color_in_use

    def set_recent_color(self, rgb):
        if self.__recent_colors[0] == rgb:
            return False
        self.__recent_colors.appendleft(rgb)
        if self.__is_recent_colors_empty is True:
            self.__is_recent_colors_empty = False
        return True

    def set_recent_colors(self, rgb_list):
        if not len(self.__recent_colors) == len(rgb_list):
            return False
        self.__recent_colors.clear()
        self.__recent_colors.extend(rgb_list)
        if self.__is_recent_colors_empty is True:
            self.__is_recent_colors_empty = False
        return True

    def get_recent_colors(self):
        return list(self.__recent_colors)

    def clear_recent_colors(self):
        count = 0
        while count < len(self.__recent_colors):
            self.__recent_colors.appendleft(Rgb(1.0, 1.0, 1.0))
            count += 1
        self.__is_recent_colors_empty = True

    def is_recent_colors_empty(self):
        return self.__is_recent_colors_empty

    def set_custom_colors(self, rgb_list):
        if len(rgb_list) < len(self.__custom_colors):
            return False
        self.__custom_colors.clear()
        self.__custom_colors.extend(rgb_list)
        return True

    def add_custom_color(self, color):
        if self.__custom_colors[0] == color:
            return False
        self.__custom_colors.appendleft(Rgb(color.red, color.green, color.blue))
        return True

    def get_custom_colors(self):
        return list(self.__custom_colors)

    def clear_custom_colors(self):
        count = 0
        while count < len(self.__custom_colors):
            self.__custom_colors.appendleft(Rgb(1.0, 1.0, 1.0))
            count += 1

    def set_fav_color(self, index, color):
        fav_color = self.__fav_colors[index]

        rgb = fav_color.rgb
        if (rgb.red, rgb.green, rgb.blue) == (color.red, color.green, color.blue):
            return False

        fav_color.rgb.update(color.red, color.green, color.blue)
        return True

    def get_fav_color(self, index):
        return self.__fav_colors[index].rgb

    def set_fav_colors(self, colors):
        if not len(self.__fav_colors) == len(colors):
            return False
        del self.__fav_colors[:]
        for color in colors:
            self.__fav_colors.append(FavColor(color))
        return True

    def get_fav_colors(self):
        out = []
        for fav in self.__fav_colors:
            out.append(fav.rgb)
        return out

    def set_fav_color_tool_tip(self, index, tool_tip):
        try:
            fav_color = self.__fav_colors[index]
        except IndexError:
            return False

        if fav_color.tool_tip == tool_tip:
            return False
        fav_color.tool_tip = tool_tip
        return True

    def get_fav_color_tool_tip(self, index):
        try:
            fav_color = self.__fav_colors[index]
        except IndexError:
            return None

        return fav_color.tool_tip

    def get_fav_color_default_tool_tip(self):
        return FavColor.DEFAULT_TOOL_TIP

    def clear_fav_colors(self):
        for index in range(len(self.__fav_colors)):
            fav_color = self.__fav_colors[index]
            fav_color.rgb.update(1.0, 1.0, 1.0)

    def get_max_num_of_custom_colors(self):
        return self.__custom_colors.maxlen

    def get_max_num_of_recent_colors(self):
        return self.__recent_colors.maxlen

    def get_max_num_of_fav_colors(self):
        return len(self.__fav_colors)

    def set_current_red(self, value):
        self.__current_color.update(
            *ColorBuilder.build_args_with_rgb(
                Rgb(value, self.__current_color.green, self.__current_color.blue)
            )
        )

    def get_current_red(self):
        return self.__current_color.red

    def set_current_green(self, value):
        self.__current_color.update(
            *ColorBuilder.build_args_with_rgb(
                Rgb(self.__current_color.red, value, self.__current_color.blue)
            )
        )

    def get_current_green(self):
        return self.__current_color.green

    def set_current_blue(self, value):
        self.__current_color.update(
            *ColorBuilder.build_args_with_rgb(
                Rgb(self.__current_color.red, self.__current_color.green, value)
            )
        )
    def get_current_blue(self):
        return self.__current_color.blue

    def set_current_temperature(self, value):
        if value == self.__current_color.temperature:
            return

        current_temperature = self.__current_color.temperature
        current_magenta = self.__current_color.magenta
        current_intensity = self.__current_color.intensity

        color = Color(
            *ColorBuilder.build_args_with_rgb(
                ColorConverter.tmi_to_rgb(
                    value,
                    current_magenta,
                    current_intensity
                )
            )
        )

        if value == 0.0:
            self.__current_color.update(*color.get())
            return

        if (current_temperature < value):
            count = 0
            while (current_temperature < value):
                count += 1
                color.update(
                    *ColorBuilder.build_args_with_rgb(
                        ColorConverter.tmi_to_rgb(
                            current_temperature + self.__color_delta,
                            current_magenta,
                            current_intensity
                        )
                    )
                )
                current_temperature = color.temperature
                current_magenta = color.magenta
                current_intensity = color.intensity
                if current_temperature > value:
                    break
        else:
            count = 0
            while (current_temperature > value):
                count += 1
                color.update(
                    *ColorBuilder.build_args_with_rgb(
                        ColorConverter.tmi_to_rgb(
                            current_temperature - self.__color_delta,
                            current_magenta,
                            current_intensity
                        )
                    )
                )
                current_temperature = color.temperature
                current_magenta = color.magenta
                current_intensity = color.intensity
                if current_temperature < value:
                    break

        self.__current_color.update(*color.get())

    def get_current_temperature(self):
        return self.__current_color.temperature

    def set_current_magenta(self, value):
        if value == self.__current_color.magenta:
            return

        current_temperature = self.__current_color.temperature
        current_magenta = self.__current_color.magenta
        current_intensity = self.__current_color.intensity

        color = Color(
            *ColorBuilder.build_args_with_rgb(
                ColorConverter.tmi_to_rgb(
                    current_temperature,
                    value,
                    current_intensity
                )
            )
        )

        if value == 0.0:
            self.__current_color.update(*color.get())
            return

        if (current_magenta < value):
            while (current_magenta < value):
                color.update(
                    *ColorBuilder.build_args_with_rgb(
                        ColorConverter.tmi_to_rgb(
                            current_temperature,
                            current_magenta + self.__color_delta,
                            current_intensity
                        )
                    )
                )
                current_temperature = color.temperature
                current_magenta = color.magenta
                current_intensity = color.intensity
                if current_magenta > value:
                    break
        else:
            while (current_magenta > value):
                color.update(
                    *ColorBuilder.build_args_with_rgb(
                        ColorConverter.tmi_to_rgb(
                            current_temperature,
                            current_magenta - self.__color_delta,
                            current_intensity
                        )
                    )
                )
                current_temperature = color.temperature
                current_magenta = color.magenta
                current_intensity = color.intensity
                if current_magenta < value:
                    break

        self.__current_color.update(*color.get())

    def get_current_magenta(self):
        return self.__current_color.magenta

    def set_current_intensity(self, value):
        self.__current_color.update(
            *ColorBuilder.build_args_with_tmi(
                self.__current_color.temperature, self.__current_color.magenta,value
            )
        )

    def get_current_intensity(self):
        return self.__current_color.intensity

    def set_current_saturation(self, value):
        red, green, blue, _ = Rgbs(
            Rgb(
                self.__current_color.red,
                self.__current_color.green,
                self.__current_color.blue
            ),
            value
        ).get()
        self.__current_color.update(
            *ColorBuilder.build_args_with_rgb(Rgb(red, green, blue))
        )

    def get_current_saturation(self):
        return self.__current_color.saturation

    def get_latest_recent_color(self):
        return self.__recent_colors[0]

    def get_color_delta(self):
        return self.__color_delta
