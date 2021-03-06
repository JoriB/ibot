import React, { Fragment, PureComponent } from 'react'
import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import DocumentEvents from 'react-document-events'

import { isEqual } from 'lodash'

import { Button } from '../button'
import Switch from '../switch'
import Icon from '../icon'

import {
  addModalToStack, deleteModalFromStack, checkNoOpenModalInStack, checkModalIndexInStack,
  toggleGlobalScroll, trimList, $, preparePortal,
} from '../util'

import './index.styl'

const { I18N = {} } = window

const MODAL_ROOT_ID = 'IBOT_MODAL_ROOT'
const MODAL_PORTAL_CLASS = 'ModalPortal'

const stopPropagation = e => e.stopPropagation()

const $body = document.body

const $modalRoot = (
  document.getElementById(MODAL_ROOT_ID)
  || Object.assign(document.createElement('div'), { id: MODAL_ROOT_ID })
)

if (!$body.contains($modalRoot)) {
  $body.appendChild($modalRoot)
}

const TYPE_CLASS_MAP = {
  alert: 'AlertModal',
  form: 'FormModal',
  functional: 'FunctionalModal',
  display: 'DisplayModal',
}

export default class Modal extends PureComponent {
  state = {
    prevProps: this.props,
    isOpen: this.props.isOpen,
  }

  portal = preparePortal(
    $modalRoot,
    trimList([MODAL_PORTAL_CLASS, this.props.portalClassName]),
  )

  static propTypes = {
    isOpen: PropTypes.bool,
    title: PropTypes.node,
    children: PropTypes.node,

    modal: PropTypes.node,
    type: PropTypes.oneOf(['alert', 'form', 'functional', 'display']),

    opener: PropTypes.node,
    openerType: PropTypes.oneOf(['primary', 'regular', 'text', 'switch', 'custom', 'none']),

    className: PropTypes.string,
    maskClassName: PropTypes.string,
    portalClassName: PropTypes.string,

    onOpen: PropTypes.func,
    onClose: PropTypes.func,
    onToggle: PropTypes.func,

    canClose: PropTypes.bool,
    canCloseOnClickMask: PropTypes.bool,
    shouldCloseOnAction: PropTypes.bool,

    canCloseOnEsc: PropTypes.bool,
    canConfirmOnEnter: PropTypes.bool,

    onConfirm: PropTypes.func,
    confirmText: PropTypes.string,
    isConfirmDisabled: PropTypes.bool,

    onCancel: PropTypes.func,
    isCancelDisabled: PropTypes.bool,
    cancelText: PropTypes.string,
  }

  static defaultProps = {
    isOpen: false,
    type: 'functional',
    openerType: 'none',

    portalClassName: '',
    maskClassName: '',
    className: '',

    onOpen: () => null,
    onClose: () => null,
    onToggle: () => null,

    canClose: true,
    canCloseOnClickMask: true,
    canCloseOnEsc: true,
    shouldCloseOnAction: true,
    canConfirmOnEnter: true,

    cancelText: I18N.cancel || 'Cancel',
    confirmText: I18N.confirm || 'Confirm',
  }

  static getDerivedStateFromProps(props, { prevProps }) {
    if (!isEqual(prevProps, props)) {
      return { prevProps: props, isOpen: props.isOpen }
    }

    return null
  }

  componentDidMount() {
    const { isOpen } = this.state
    if (isOpen) this.didOpen()

    window.addEventListener('resize', this.positionY)
  }

  componentDidUpdate(_, { isOpen: wasOpen }) {
    const { isOpen } = this.state

    if (!wasOpen && isOpen) {
      this.open()
    } else if (wasOpen && !isOpen) {
      this.close()
    }
  }

  componentWillUnmount() {
    if (this.portal) this.portal.remove()

    this.didClose()
    window.removeEventListener('resize', this.positionY)
  }

  open = () => this.setState({ isOpen: true }, this.didOpen)
  close = () => this.portal.classList.remove('is-open')

  toggle = (willBeOpen = !this.state.isOpen) => (
    willBeOpen ? this.open() : this.close()
  )

  didOpen = () => {
    const { portal } = this

    // Store in the modal stack to monitor:
    addModalToStack(this)

    // Reassign Y position of the modal:
    this.positionY()
    this.focusOnInput()

    // Transition:
    setTimeout(() => this.portal.classList.add('is-open'))
  }

  didClose = () => setTimeout(() => {
    // Remove from the stack in the next round:
    deleteModalFromStack(this)


    if (checkNoOpenModalInStack()) {
      toggleGlobalScroll(false)
    }
  })

  onTransitionEnd = () => {
    const isOpen = this.portal.classList.contains('is-open')

    if (isOpen) {
      this.props.onOpen()
      this.props.onToggle(true)
      toggleGlobalScroll(true)
    } else {
      this.setState({ isOpen: false }, this.didClose)
      this.props.onClose()
      this.props.onToggle(false)
    }
  }

  onConfirm = () => {
    const {
      onConfirm,
      shouldCloseOnAction,
      isConfirmDisabled,
    } = this.props

    if (typeof onConfirm === 'function' && !isConfirmDisabled) {
      onConfirm()
    }

    if (shouldCloseOnAction) {
      this.close()
    }
  }

  onCancel = () => {
    const {
      onCancel,
      shouldCloseOnAction,
      isCancelDisabled,
    } = this.props

    if (typeof onCancel === 'function' && !isCancelDisabled) {
       onCancel()
    }

    if (shouldCloseOnAction) {
      this.close()
    }
  }

  positionY = () => setTimeout(() => {
    const { type } = this.props
    const $modal = $('.Modal', this.portal)

    if (!$modal || type === 'alert') return

    const { innerHeight: vh } = window
    const { offsetHeight: h } = $modal

    const action = (vh <= h || ((vh - h)/2) < (vh * .2)) ? 'add' : 'remove'
    $modal.classList[action]('is-v-centered')
  })

  focusOnInput = () => {
    const $input = $('.content input', this.portal)
    if ($input) $input.focus()
  }

  onKeyDown = ({ key, target: $elmt }) => {
    const {
      type,
      canClose, canCloseOnEsc,
      canConfirmOnEnter,
      onConfirm,
    } = this.props

    const { isOpen } = this.state
    const isSelectMenuOpen = !!$('#IBOT_SELECT_MENU_ROOT .SelectMenu.is-open')

    if (
      key === 'Escape'

      // Not focus on form elements:
      && !$elmt.matches('input, textarea, select') && !isSelectMenuOpen

      // Current modal is open and can close via esc:
      && isOpen && canClose && canCloseOnEsc && !isSelectMenuOpen

      // Only work on the toppest modal:
      && checkModalIndexInStack(this) === 0
    ) {
      this.close()
    }

    if (
      key === 'Enter'

      // Not focus on form elements:
      && !$elmt.matches('textarea, button') && !isSelectMenuOpen

      // Current modal is open and can confirm via enter:
      && isOpen && canConfirmOnEnter

      // Only work on the toppest modal:
      && checkModalIndexInStack(this) === 0

      // Only work whilst `onConfirm` callback is provided:
      && (!!onConfirm || type === 'alert')
    ) {
      this.onConfirm()
    }
  }

  onClickMask = e => {
    stopPropagation(e)

    const { canClose, canCloseOnClickMask } = this.props
    const isSelectMenuOpen = !!$('#IBOT_SELECT_MENU_ROOT .SelectMenu.is-open')

    if (canClose && canCloseOnClickMask && !isSelectMenuOpen) {
      this.close()
    }
  }

  render() {
    return this.renderOpener()
  }

  renderOpener() {
    const { opener, openerType } = this.props
    const { isOpen } = this.state

    const modal = this.renderModal()

    return (
      openerType === 'none'
      ? modal

      : openerType === 'custom'
      ? (
        opener
        ? <span onClick={this.toggle}>
            { opener }
            { modal }
          </span>
        : modal
      )

      : openerType === 'switch'
      ? <Switch isChecked={isOpen} onChange={this.toggle}>
          { modal }
        </Switch>

      : <Button type={openerType} onClick={this.open}>
          { opener }
          { modal }
        </Button>
    )
  }

  renderModal() {
    const { modal } = this.props
    return modal || createPortal(this.renderModalDOM(), this.portal)
  }

  renderModalDOM() {
    const {
      type,
      title,
      children,

      maskClassName,
      className,

      canClose,
      canCloseOnClickMask,

      onCancel,
      cancelText,
      isCancelDisabled,

      onConfirm,
      confirmText,
      isConfirmDisabled,
    } = this.props

    const { isOpen } = this.state

    const shouldRenderFooter = (
      (type === 'alert' && canClose)
      || onCancel || onConfirm
    )

    return isOpen && (
      <Fragment>
        <div
          className={trimList([
            'ModalMask',
            maskClassName,
            canClose && canCloseOnClickMask ? 'can-close' : 'cant-close',
          ])}
          onClick={this.onClickMask}
          onTransitionEnd={this.onTransitionEnd}
        />
        <div
          className={trimList(['Modal', TYPE_CLASS_MAP[type], className])}
          onClick={stopPropagation}
          onTransitionEnd={stopPropagation}
        >
          {/* Header */}
          <header>
            { title }

            {/* Close button */}
            { canClose && (
              <button className="close-btn" onClick={this.close}>
                <Icon name="times" />
              </button>
            )}
          </header>

          {/* Main content */}
          <div className="content">
            { children }
          </div>

          {/* Footer */}
          { shouldRenderFooter && (
            <footer>
              { onCancel && (
                <button
                  className="cancel-btn"
                  onClick={this.onCancel}
                  disabled={isCancelDisabled}
                >
                  {cancelText}
                </button>
              )}

              { (type === "alert" || onConfirm) && (
                <button
                  className="confirm-btn"
                  onClick={this.onConfirm}
                  disabled={isConfirmDisabled}
                >
                  {confirmText}
                </button>
              )}
            </footer>
          )}
        </div>

        <DocumentEvents
          onKeyDown={this.onKeyDown}
        />
      </Fragment>
    )
  }
}
