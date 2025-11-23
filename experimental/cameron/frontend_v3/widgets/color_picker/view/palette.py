try:
    from PySide2 import QtCore, QtGui, QtWidgets
    from PySide2.QtWidgets import QAction
except ImportError:
    from PySide6 import QtCore, QtGui, QtWidgets
    from PySide6.QtGui import QAction
from widgets.color_picker.view import qcolor
from widgets.color_picker.model import Rgb
import widgets.color_picker.view.resources.resources


class TileButton(QtWidgets.QToolButton):

    def __init__(self, parent=None):
        super().__init__(parent)
        self.__width = 20
        self.__height = 20
        self.setIconSize(QtCore.QSize(self.__width, self.__height))
        self.setFixedSize(self.__width, self.__height)
        self.setFocusPolicy(QtCore.Qt.ClickFocus)

    @property
    def width(self):
        return self.__width

    @property
    def height(self):
        return self.__height


class Tile(QtCore.QObject):
    SIG_CLICKED = QtCore.Signal()

    def __init__(self):
        super().__init__()

        self.__button = TileButton()
        self.__button.clicked.connect(lambda : self.SIG_CLICKED.emit())

        self.set_style_sheet('padding: 0px; margin: 0px;')

    def set_color(self, red, green, blue):
        pixmap = QtGui.QPixmap(self.__button.width, self.__button.height)
        q_color = QtGui.QColor()
        q_color.setRgbF(red, green, blue)
        pixmap.fill(q_color)
        self.__button.setIcon(QtGui.QIcon(pixmap))

    def set_style_sheet(self, style_sheet):
        self.__button.setStyleSheet(style_sheet)

    def set_tool_tip(self, tool_tip):
        self.__button.setToolTip(tool_tip)

    @property
    def widget(self):
        return self.__button


class BasicTile(QtWidgets.QHBoxLayout):
    SIG_CLICKED = QtCore.Signal(object)

    def __init__(self, red, green, blue):
        super().__init__()
        self.__tile = Tile()

        self.__red = red
        self.__green = green
        self.__blue = blue
        self.__tile.set_color(self.__red, self.__green, self.__blue)

        self.__tile.SIG_CLICKED.connect(self.__emit_click)

        self.addWidget(self.__tile.widget)

    def __emit_click(self):
        self.SIG_CLICKED.emit(Rgb(self.__red, self.__green, self.__blue))


class ColorTile(QtWidgets.QHBoxLayout):
    SIG_CLICKED = QtCore.Signal(object)

    def __init__(self, red, green, blue):
        super().__init__()
        self.__tile = Tile()

        self.__red = red
        self.__green = green
        self.__blue = blue
        self.__tile.set_color(self.__red, self.__green, self.__blue)

        self.__tile.SIG_CLICKED.connect(self.__emit_click)

        self.addWidget(self.__tile.widget)

    def __emit_click(self):
        self.SIG_CLICKED.emit(Rgb(self.__red, self.__green, self.__blue))

    def set_color(self, red, green, blue):
        self.__red, self.__green, self.__blue = red, green, blue
        self.__tile.set_color(red, green, blue)

    def get_color(self):
        return Rgb(self.__red, self.__green, self.__blue)


class FavTile(QtWidgets.QHBoxLayout):
    SIG_CLICKED = QtCore.Signal(object)
    HOTKEY_NOT_SET = 'Hotkey not set!'
    SIG_SET_FAV_KEY_TOOLTIP = QtCore.Signal(int, str)

    def __init__(self, red, green, blue):
        super().__init__()
        self.__tile = Tile()
        self.__tile.set_style_sheet("QToolButton { border: 2px solid #a9a9a9; }")
        self.set_tool_tip(FavTile.HOTKEY_NOT_SET)

        self.__red, self.__green, self.__blue = red, green, blue
        self.__tile.set_color(self.__red, self.__green, self.__blue)

        self.__tile.SIG_CLICKED.connect(self.__emit_click)

        self.addWidget(self.__tile.widget)

    def __emit_click(self):
        self.SIG_CLICKED.emit(Rgb(self.__red, self.__green, self.__blue))

    def set_color(self, red, green, blue):
        self.__red, self.__green, self.__blue = red, green, blue
        self.__tile.set_color(red, green, blue)

    def set_tool_tip(self, tool_tip):
        if tool_tip == "":
            tool_tip = FavTile.HOTKEY_NOT_SET
        self.__tile.set_tool_tip(tool_tip)


class PaletteButton(QtWidgets.QToolButton):
    def __init__(self, icon_path, tooltip, parent=None):
        super().__init__(parent)
        self.setToolTip(tooltip)
        self.setFocusPolicy(QtCore.Qt.NoFocus)
        self.resize(18, 15)
        self.setIcon(QtGui.QIcon(icon_path))


class BasicPalette(QtWidgets.QWidget):
    ROWS = 6
    COLUMNS = 8
    SIG_TILE_CLICKED = QtCore.Signal(object)

    def __init__(self):
        super().__init__()
        self.__tiles = []
        self.__rows = 6
        self.__columns = 8
        self.__colors = [
            (0, 0, 0),
            (170, 0, 0),
            (0, 85, 0),
            (170, 85, 0),
            (0, 170, 0),
            (170, 170, 0),
            (0, 255, 0),
            (170, 255, 0),
            (0, 0, 127),
            (170, 0, 127),
            (0, 85, 127),
            (170, 85, 127),
            (0, 170, 127),
            (170, 170, 127),
            (0, 255, 127),
            (170, 255, 127),
            (0, 0, 255),
            (170, 0, 255),
            (0, 85, 255),
            (170, 85, 255),
            (0, 170, 255),
            (170, 170, 255),
            (0, 255, 255),
            (170, 255, 255),
            (85, 0, 0),
            (255, 0, 0),
            (85, 85, 0),
            (255, 85, 0),
            (85, 170, 0),
            (255, 170, 0),
            (85, 255, 0),
            (255, 255, 0),
            (85, 0, 127),
            (255, 0, 127),
            (85, 85, 127),
            (255, 85, 127),
            (85, 170, 127),
            (255, 170, 127),
            (85, 255, 127),
            (255, 255, 127),
            (85, 0, 255),
            (255, 0, 255),
            (85, 85, 255),
            (255, 85, 255),
            (85, 170, 255),
            (255, 170, 255),
            (85, 255, 255),
            (255, 255, 255)
        ]

        self.__layout = QtWidgets.QGridLayout()
        self.__layout.addWidget(QtWidgets.QLabel("Basic Colors"), 0, 0, 1, 8)
        self.__layout.setSpacing(10)

        row = 1
        col = 0
        for color in self.__colors:
            scalar = 255.0
            color = [channel/scalar for channel in color]
            tile = BasicTile(*color)
            tile.SIG_CLICKED.connect(self.SIG_TILE_CLICKED)
            self.__layout.addLayout(tile, row, col)
            if col < self.__columns - 1:
                col += 1
            elif row < self.__rows:
                row += 1
                col = 0

        self.setLayout(self.__layout)


class RecentPalette(QtWidgets.QWidget):
    SIG_TILE_CLICKED = QtCore.Signal(object)
    SIG_CLEAR_COLORS = QtCore.Signal()

    def __init__(self):
        super().__init__()

        self.__rows = 2
        self.__columns = 8
        self.__tiles = []
        self.__layout = QtWidgets.QGridLayout()

        clear = PaletteButton(":x16.png", "Clear Palette")
        clear.clicked.connect(self.SIG_CLEAR_COLORS)

        self.__layout.addWidget(QtWidgets.QLabel("Recent Colors"), 0, 0, 1, 6)
        self.__layout.addWidget(clear, 0, 7)

        row = 1
        col = 0
        for _ in range(self.__rows * self.__columns):
            tile = ColorTile(1.0, 1.0, 1.0)
            tile.SIG_CLICKED.connect(self.SIG_TILE_CLICKED)
            self.__layout.addLayout(tile, row, col)
            self.__tiles.append(tile)
            if col < self.__columns - 1:
                col += 1
            elif row < self.__rows:
                row += 1
                col = 0
        self.setLayout(self.__layout)

    def update_colors(self, colors):
        if not len(colors) == len(self.__tiles):
            return
        for index, tile in enumerate(self.__tiles):
            tile.set_color(*colors[index].get())


class FavColorAction(QAction):
    SIG_TRIGGERED = QtCore.Signal(int)

    def __init__(self, index, parent):
        super().__init__(parent)

        self.setText('Set favorite color ' + str(index + 1))
        self.__index = index

        self.triggered.connect(lambda : self.SIG_TRIGGERED.emit(self.__index))


class CustomPalette(QtWidgets.QWidget):
    SIG_TILE_CLICKED = QtCore.Signal(object)
    SIG_SET_FAV_COLOR = QtCore.Signal(int)
    SIG_CLEAR_FAV_COLORS = QtCore.Signal()
    SIG_ADD_CUSTOM_COLOR = QtCore.Signal()
    SIG_CLEAR_CUSTOM_COLORS = QtCore.Signal()

    FAV_COLORS = [0, 1, 2]

    def __init__(self):
        super().__init__()

        self.__rows = 2
        self.__columns = 8
        self.__num_of_fav_tiles = 3
        self.__fav_tiles = []
        self.__tiles = []
        self.__layout = QtWidgets.QGridLayout()

        fav = self.__createFavButton()
        add = PaletteButton(":plus28.png", "Add to Palette")
        clear = PaletteButton(":x16.png", "Clear Palette")
        self.__layout.addWidget(QtWidgets.QLabel("Custom Colors"), 0, 0, 1, 4)
        self.__layout.addWidget(fav, 0, 5)
        self.__layout.addWidget(add, 0, 6)
        self.__layout.addWidget(clear, 0, 7)

        row = 1
        col = 0
        fav_tile_index = 0
        for _ in range(self.__rows * self.__columns):
            if fav_tile_index < self.__num_of_fav_tiles:
                tile = FavTile(1.0, 1.0, 1.0)
                self.__fav_tiles.append(tile)
                fav_tile_index += 1
            else:
                tile = ColorTile(1.0, 1.0, 1.0)
                self.__tiles.append(tile)
            tile.SIG_CLICKED.connect(self.SIG_TILE_CLICKED)
            self.__layout.addLayout(tile, row, col)

            if col < self.__columns - 1:
                col += 1
            elif row < self.__rows:
                row += 1
                col = 0

        self.setLayout(self.__layout)

        add.clicked.connect(self.SIG_ADD_CUSTOM_COLOR)
        clear.clicked.connect(self.SIG_CLEAR_CUSTOM_COLORS)

    def __createFavButton(self):
        button = PaletteButton(":heart28.png", """Set Favorites<br>
                    (Use Hotkey Editor to set favorite color hotkeys)""")

        menu = QtWidgets.QMenu()

        for index in CustomPalette.FAV_COLORS:
            action = FavColorAction(index, self)
            menu.addAction(action)
            action.SIG_TRIGGERED.connect(self.SIG_SET_FAV_COLOR)

        clear_all = QAction('Clear all', self)
        clear_all.triggered.connect(self.__emit_clear_fav_colors)
        menu.addAction(clear_all)
        button.setPopupMode(QtWidgets.QToolButton.InstantPopup)
        button.setMenu(menu)
        button.menu()
        return button

    def __emit_clear_fav_colors(self):
        self.SIG_CLEAR_FAV_COLORS.emit()

    def update_custom_colors(self, colors):
        if not len(colors) == len(self.__tiles):
            return
        for index, tile in enumerate(self.__tiles):
            tile.set_color(*colors[index].get())

    def set_fav_color(self, index, rgb):
        fav_tile = self.__fav_tiles[index]
        fav_tile.set_color(*rgb.get())

    def set_fav_colors(self, colors):
        for index, color in enumerate(colors):
            self.set_fav_color(index, color)

    def clear_fav_colors(self, colors):
        for fav_tile, color in zip(self.__fav_tiles, colors):
            fav_tile.set_color(*color.get())

    def set_fav_color_tool_tip(self, index, tool_tip):
        self.__fav_tiles[index].set_tool_tip(tool_tip)
