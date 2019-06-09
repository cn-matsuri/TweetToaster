# -*- coding: utf-8 -*-

# Form implementation generated from reading ui file 'c:/gui.ui',
# licensing of 'c:/gui.ui' applies.
#
# Created: Fri Jun  7 18:34:05 2019
#      by: pyside2-uic  running on PySide2 5.12.3
#
# WARNING! All changes made in this file will be lost!
import sys

from PySide2 import QtCore, QtGui, QtWidgets

from run import run


class Ui_Dialog(object):
    def setupUi(self, Dialog):
        Dialog.setObjectName("Dialog")
        Dialog.resize(748, 620)
        Dialog.setFocusPolicy(QtCore.Qt.NoFocus)
        Dialog.setToolTip("")
        self.formLayoutWidget = QtWidgets.QWidget(Dialog)
        self.formLayoutWidget.setGeometry(QtCore.QRect(30, 30, 691, 401))
        self.formLayoutWidget.setObjectName("formLayoutWidget")
        self.gridLayout = QtWidgets.QGridLayout(self.formLayoutWidget)
        self.gridLayout.setContentsMargins(0, 0, 0, 0)
        self.gridLayout.setObjectName("gridLayout")
        self.label_img_path = QtWidgets.QLabel(self.formLayoutWidget)
        font = QtGui.QFont()
        font.setFamily("微软雅黑")
        font.setPointSize(16)
        self.label_img_path.setFont(font)
        self.label_img_path.setObjectName("label_img_path")
        self.gridLayout.addWidget(self.label_img_path, 1, 0, 1, 1)
        self.label_translation = QtWidgets.QLabel(self.formLayoutWidget)
        font = QtGui.QFont()
        font.setFamily("微软雅黑")
        font.setPointSize(16)
        self.label_translation.setFont(font)
        self.label_translation.setObjectName("label_translation")
        self.gridLayout.addWidget(self.label_translation, 2, 0, 1, 1)
        self.label_link = QtWidgets.QLabel(self.formLayoutWidget)
        font = QtGui.QFont()
        font.setFamily("微软雅黑")
        font.setPointSize(16)
        self.label_link.setFont(font)
        self.label_link.setObjectName("label_link")
        self.gridLayout.addWidget(self.label_link, 0, 0, 1, 1)
        self.lineEdit_img_file = QtWidgets.QLineEdit(self.formLayoutWidget)
        self.lineEdit_img_file.setText("")
        self.lineEdit_img_file.setObjectName("lineEdit_img_file")
        self.gridLayout.addWidget(self.lineEdit_img_file, 1, 1, 1, 1)
        self.lineEdit_link = QtWidgets.QLineEdit(self.formLayoutWidget)
        self.lineEdit_link.setText("")
        self.lineEdit_link.setObjectName("lineEdit_link")
        self.gridLayout.addWidget(self.lineEdit_link, 0, 1, 1, 2)
        self.textEdit_translation = QtWidgets.QTextEdit(self.formLayoutWidget)
        self.textEdit_translation.setObjectName("textEdit_translation")
        self.gridLayout.addWidget(self.textEdit_translation, 2, 1, 1, 2)
        self.pushButton_select_file = QtWidgets.QPushButton(self.formLayoutWidget)
        self.pushButton_select_file.setObjectName("pushButton_select_file")
        self.gridLayout.addWidget(self.pushButton_select_file, 1, 2, 1, 1)
        self.gridLayoutWidget = QtWidgets.QWidget(Dialog)
        self.gridLayoutWidget.setGeometry(QtCore.QRect(30, 430, 691, 101))
        self.gridLayoutWidget.setObjectName("gridLayoutWidget")
        self.gridLayout_2 = QtWidgets.QGridLayout(self.gridLayoutWidget)
        self.gridLayout_2.setContentsMargins(0, 0, 0, 0)
        self.gridLayout_2.setObjectName("gridLayout_2")
        self.label_proxy = QtWidgets.QLabel(self.gridLayoutWidget)
        self.label_proxy.setObjectName("label_proxy")
        self.gridLayout_2.addWidget(self.label_proxy, 0, 1, 1, 1)
        self.checkBox_proxy = QtWidgets.QCheckBox(self.gridLayoutWidget)
        self.checkBox_proxy.setObjectName("checkBox_proxy")
        self.gridLayout_2.addWidget(self.checkBox_proxy, 0, 0, 1, 1)
        self.lineEdit_proxy = QtWidgets.QLineEdit(self.gridLayoutWidget)
        self.lineEdit_proxy.setObjectName("lineEdit_proxy")
        self.gridLayout_2.addWidget(self.lineEdit_proxy, 0, 2, 1, 1)
        self.gridLayoutWidget_2 = QtWidgets.QWidget(Dialog)
        self.gridLayoutWidget_2.setGeometry(QtCore.QRect(30, 530, 691, 51))
        self.gridLayoutWidget_2.setObjectName("gridLayoutWidget_2")
        self.gridLayout_3 = QtWidgets.QGridLayout(self.gridLayoutWidget_2)
        self.gridLayout_3.setContentsMargins(0, 0, 0, 0)
        self.gridLayout_3.setObjectName("gridLayout_3")
        self.pushButton_gen = QtWidgets.QPushButton(self.gridLayoutWidget_2)
        self.pushButton_gen.setCheckable(False)
        self.pushButton_gen.setObjectName("pushButton_gen")
        self.gridLayout_3.addWidget(self.pushButton_gen, 0, 0, 1, 1)

        self.retranslateUi(Dialog)
        QtCore.QMetaObject.connectSlotsByName(Dialog)

    def retranslateUi(self, Dialog):
        Dialog.setWindowTitle(QtWidgets.QApplication.translate("Dialog", "Matsuri_Translation", None, -1))
        self.label_img_path.setText(QtWidgets.QApplication.translate("Dialog", "图片存储路径", None, -1))
        self.label_translation.setText(QtWidgets.QApplication.translate("Dialog", "翻译文本", None, -1))
        self.label_link.setText(QtWidgets.QApplication.translate("Dialog", "推文链接", None, -1))
        self.pushButton_select_file.setText(QtWidgets.QApplication.translate("Dialog", "浏览", None, -1))
        self.label_proxy.setText(QtWidgets.QApplication.translate("Dialog", "代理地址（如127.0.0.1:1080）", None, -1))
        self.checkBox_proxy.setText(QtWidgets.QApplication.translate("Dialog", "是否启用代理", None, -1))
        self.pushButton_gen.setText(QtWidgets.QApplication.translate("Dialog", "生成", None, -1))


class Test(QtWidgets.QDialog):
    def __init__(self):
        QtWidgets.QDialog.__init__(self)
        self.ui = Ui_Dialog()
        self.ui.setupUi(self)
        self.ui.pushButton_select_file.clicked.connect(self.pickup_file)
        self.ui.pushButton_gen.clicked.connect(self.gen)

    def pickup_file(self):
        filename = QtWidgets.QFileDialog.getSaveFileName()[0]
        if filename:
            self.ui.lineEdit_img_file.setText(filename)

    def gen(self):
        def check():
            edit_list = [self.ui.lineEdit_link, self.ui.lineEdit_img_file, self.ui.textEdit_translation]
            for edit in edit_list:
                try:
                    text = edit.text()
                except AttributeError:
                    text = edit.toPlainText()
                if not text:
                    self.hit_warning(edit, '不能为空')
                    raise RuntimeError

        check()
        QtWidgets.QMessageBox().warning(self, '提示',
                                        f'点击确认执行操作，耗时约10s',
                                        QtWidgets.QMessageBox.Ok, QtWidgets.QMessageBox.Cancel)
        if self.ui.checkBox_proxy.isChecked():
            result = run(self.ui.lineEdit_link.text(), self.ui.lineEdit_img_file.text(),
                         self.ui.textEdit_translation.toPlainText(),
                         enable_proxy=True, proxy=self.ui.lineEdit_proxy.text())
        else:
            result = run(self.ui.lineEdit_link.text(), self.ui.lineEdit_img_file.text(),
                         self.ui.textEdit_translation.toPlainText())
        if result:
            QtWidgets.QMessageBox().warning(self, '提示',
                                            f'操作成功\n 已保存至{self.ui.lineEdit_img_file.text()}',
                                            QtWidgets.QMessageBox.Ok, QtWidgets.QMessageBox.Cancel)
        else:
            self.hit_warning(False, '操作失败')

    def hit_warning(self, _object, info):
        error_info = {'lineEdit_img_file': '图片保存路径',
                      'lineEdit_link': '推文地址',
                      'textEdit_translation': '翻译内容',
                      'lineEdit_proxy': '代理地址'}
        if _object:
            _signal = _object.objectName()
        else:
            _signal = 'None'
        warning_box = QtWidgets.QMessageBox().warning(self, '错误',
                                                      f'{error_info.get(_signal, "")}{info}',
                                                      QtWidgets.QMessageBox.Ok, QtWidgets.QMessageBox.Cancel)


app = QtWidgets.QApplication(sys.argv)
test = Test()
test.show()
sys.exit(app.exec_())
