import React, { createRef, PureComponent } from 'react'
import { createPortal } from 'react-dom'
import PropTypes from 'prop-types'
import DocumentEvents from 'react-document-events'

import { get, isArray, isEqual, isElement } from 'lodash'

import Dropdown from '../dropdown'
import { Input } from './Input'
import { Ellipsis } from '../text'

import { preventScrollingPropagation, trimList, $, $$, preparePortal } from '../util'
import { INPUT_ARROW } from '../util/svg'
import { positionMenu } from '../dropdown/util'
import { getOptionLabel, getOptionValue, checkOptionByValue } from './util'

import './index.styl'

const MENU_ROOT_ID = 'IBOT_SELECT_MENU_ROOT'

const { I18N = {} } = window

export const $menuRoot = (
  document.getElementById(MENU_ROOT_ID)
  || Object.assign(document.createElement('div'), { id: MENU_ROOT_ID })
)

const $body = document.body

if (!$body.contains($menuRoot)) {
  $body.appendChild($menuRoot)
}

export class Select extends PureComponent {
  state = {
    isOpen: false,

    prevProps: this.props,
    value: this.props.value,
  }

  static propTypes = {
    size: PropTypes.oneOf(['regular', 'small']),
    theme: PropTypes.oneOf(['core', 'plain']),
    menuTheme: PropTypes.oneOf(['core', 'plain']),

    unstyled: PropTypes.bool,

    className: PropTypes.string,
    menuClassName: PropTypes.string,

    placeholder: PropTypes.string,

    /**
     * A valid option list looks like either one below:
     *
     * ['Apple', 'Pencil']
     * ['Apple', { label: <span>Pencil <Icon name="pencil"/></span>, value: 'pencil' }]
     * [{ label: 'Apple', isDisabled: true }, 'Pencil']
     *
     * [
     *  'An apple',
     *  [
     *    'Stationery', // First entry of an array is the title of the group.
     *    'A pen',
     *    'A marker',
     *    {
     *      label: <span>A pencil <Icon name="pencil"/></span>,
     *      value: 'pencil',
     *      isDisabled: true
     *    },
     *  ],
     *  { label: 'Blackberries' },
     * ]
     *
     */
    optionList: PropTypes.arrayOf(
      PropTypes.oneOfType([
        // Regular options:
        PropTypes.node,
        PropTypes.shape({
          label: PropTypes.node,
          value: PropTypes.any,
          isDisabled: PropTypes.bool,
        }),

        // Option groups:
        PropTypes.arrayOf(
          PropTypes.oneOfType([
            PropTypes.node,
            PropTypes.shape({
              label: PropTypes.node,
              value: PropTypes.any,
              isDisabled: PropTypes.bool,
            }),
          ])
        ),
      ])
    ).isRequired,

    value: PropTypes.oneOfType([
      PropTypes.number,
      PropTypes.string,
    ]),

    isDisabled: PropTypes.bool,
    disabled: PropTypes.bool,
    readOnly: PropTypes.bool,

    onChange: PropTypes.func,

    menuX: PropTypes.oneOf(['left', 'center', 'right']),
  }

  static defaultProps = {
    size: 'regular',
    theme: 'plain',
    menuTheme: 'plain',

    className: '',
    menuClassName: '',

    placeholder: I18N.select_placeholder || 'Choose one…',
    emptyMsg: I18N.select_empty_msg || 'Nothing to display…',
    optionList: [],
    isDisabled: false,

    onChange: () => null,

    menuX: 'left',
  }


  static getDerivedStateFromProps(props, { prevProps, value }) {
    if (!isEqual(prevProps, props)) {
      return { prevProps: props, value: props.value }
    }
    return null
  }

  componentDidMount() {
    window.addEventListener('resize', this.onResizeWindow)
  }

  get isDisabled() {
    const { isDisabled, disabled } = this.props
    return isDisabled || disabled
  }

  get readOnly() {
    return this.props.readOnly
  }

  get canSelect() {
    const { isDisabled, readOnly } = this
    return !isDisabled && !readOnly
  }

  set$select = $select => this.setState({ $select })

  open = () => this.setState({ isOpen: true })
  close = () => this.setState({ isOpen: false })
  toggle = () => this.setState({ isOpen: !this.state.isOpen })

  onResizeWindow = () => this.state.isOpen && this.close()

  onChange = value => this.setState(
    { value },
    () => {
      this.close()
      this.props.onChange(value)
    },
  )

  onSelect = ({ currentTarget: $opt }) => {
    const { value } = this.props
    const { canSelect } = this

    return this.onChange(canSelect ? $opt.dataset.value : value)
  }

  get displayText() {
    const { optionList, placeholder } = this.props
    const { value } = this.state

    const group = optionList.find(g => (
      isArray(g) && g.slice(0).some(o => checkOptionByValue(o, value))
    ))

    const option = (group || optionList).find(o => (
      !isArray(o) && checkOptionByValue(o, value)
    ))

    return !!option ? getOptionLabel(option) : placeholder
  }

  render() {
    const { size, theme, unstyled, className, menuX } = this.props
    const { isOpen, $select, value } = this.state
    const { isDisabled, readOnly, canSelect } = this

    const klass = trimList([
      theme === 'core' ? 'CoreSelect' : 'Select',
      size,
      unstyled && 'unstyled',
      className,
      isOpen && 'is-open',
      isDisabled && 'is-disabled',
      readOnly && 'readonly',
    ])

    return (
      <label
        className={klass}
        role="listbox"
        ref={this.set$select}
      >
        <button type="button" onClick={this.toggle} disabled={isDisabled}>
          <Ellipsis>{ this.displayText }</Ellipsis>
        </button>

        <span className="caret" dangerouslySetInnerHTML={{ __html: INPUT_ARROW }} />

        <SelectMenu
          isOpen={isOpen}
          {...this.props}
          value={value}
          $select={$select}

          canSelect={canSelect}
          onChange={this.onSelect}
          onClose={this.close}
          menuX={menuX}
        />
      </label>
    )
  }
}

export class SelectMenu extends PureComponent {
  state = {
    isDownward: true,
  }

  portal = preparePortal($menuRoot, 'SelectMenuPortal')

  static propTypes = {
    ...Select.propTypes,
    isOpen: PropTypes.bool,

    canSelect: PropTypes.bool,
    onChange: PropTypes.func,
    onClose: PropTypes.func,
    $select: PropTypes.instanceOf(Element),
  }

  static defaultProps = {
    isOpen: false,
  }

  menuBaseRef = createRef()

  componentDidMount() {
    const { menuBaseRef: { current: $menuBase } } = this
    preventScrollingPropagation($('.SelectMenu', $menuBase))
  }

  componentDidUpdate({ isOpen: wasOpen }) {
    const { isOpen } = this.props

    // Set up the position of the <SelectMenu> once opened:
    if (!wasOpen && isOpen) {
      this.position()
      this.scrollIntoActive()
    }
  }

  componentWillUnmount() {
    if (this.portal) this.portal.remove()
  }

  position = e => {
    const { $select, menuX } = this.props
    const { menuBaseRef: { current: $menuBase } } = this

    if (e) {
      const $target = get(e, 'target')
      if ($target && isElement($target) && $target.matches('.SelectMenu')) return
    }

    const { isDownward } = positionMenu({
      $menuBase,
      $opener: $select,

      menuX,
      shouldSetMaxHeight: true,
    })

    this.setState({ isDownward })
  }

  /**
   * Workaround for Safari where options in invisible areas are still clickable.
   */
  onChange = e => {
    const { canSelect, onChange } = this.props
    const { isDownward } = this.state

    const $opt = e.currentTarget
    const $menuBase = $opt.closest('.SelectMenu, .CoreSelectMenu')

    if (!$opt || !$menuBase) {
      return this.onlose()
    }

    const { top: topOf$opt, bottom: bottomOf$opt } = $opt.getBoundingClientRect()
    const { top: topOf$menuBase, bottom: bottomOf$menuBase } = $menuBase.getBoundingClientRect()

    if (
      isDownward && topOf$opt >= topOf$menuBase
      || !isDownward && bottomOf$opt <= bottomOf$menuBase
    ) {
      if ($opt.classList.contains('title')) return

      return onChange(e)
    }

    return this.onClose()
  }

  onClose = () => {
    const { onClose } = this.props

    onClose()
  }

  scrollIntoActive = () => {
    const { menuBaseRef: { current: $menuBase } } = this
    const $current = $('li[role=option].is-active', $menuBase)

    if ($current) {
      $current.scrollIntoView({ block: 'start' })
    }
  }

  onClickOutside = ({ target }) => {
    const { $select } = this.props

    const isOutsideMenu = !$menuRoot.contains(target)

    const closestLabel = target.closest('label')
    const isOwnLabel = closestLabel && closestLabel.contains($select)

    if (isOutsideMenu && !isOwnLabel) {
      this.onClose()
    }
  }

  render() {
    return createPortal(this.renderMenu(), this.portal)
  }

  renderMenu() {
    const {
      isOpen,
      isDisabled, readOnly,
      menuTheme, menuClassName, menuX,
      optionList,
      emptyMsg,
      value,
      canSelect,
    } = this.props

    const { isDownward } = this.state

    const isEmpty = optionList.length === 0

    const klass = trimList([
      menuTheme === 'core' ? 'CoreSelectMenu' : 'SelectMenu',
      menuClassName,
      `x-${menuX}`,
      isOpen && 'is-open',
      isDownward ? 'is-downward' : 'is-upward',
      isDisabled && 'is-disabled',
      isEmpty && 'is-empty',
      canSelect ? 'can-select' : 'cant-select',
    ])

    return (
      <div ref={this.menuBaseRef} className="SelectMenuBase">
        <ul className={klass} onTransitionEnd={this.onTransitionEnd}>
          {
            isEmpty
            ? <li className="SelectOption empty-msg">{ emptyMsg }</li>
            : (
              optionList
              .map((option, idx) => (
                isArray(option)
                ? <Group
                    key={idx}
                    optionList={option}
                    value={value}
                    onChange={this.onChange}
                  />
                : <Option
                    key={idx}
                    isActive={checkOptionByValue(option, value)}
                    option={option}
                    isDisabled={option.isDisabled}
                    onChange={this.onChange}
                  />
              ))
            )
          }

          <DocumentEvents
            enabled={isOpen}
            capture={false}
            onClick={this.onClickOutside}
          />

          <DocumentEvents
            enabled={isOpen}
            capture={true}
            onScroll={this.position}
          />
        </ul>
      </div>
    )
  }
}

function Group({
  value,
  optionList: [title, ...optionList],
  onChange,
}) {
  return (
    <li className="SelectGroup">
      <Ellipsis className="title" onClick={onChange}>{ title }</Ellipsis>

      <ul>
      {
        optionList
        .map((option, idx) => (
          <Option
            key={idx}
            option={option}
            isActive={checkOptionByValue(option, value)}
            isDisabled={option.isDisabled}
            onChange={onChange}
          />
        ))
      }
      </ul>
    </li>
  )
}

Group.propTypes = {
  idx: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  optionList: PropTypes.array,
  onChange: PropTypes.func,
}

function Option({
  option,
  isActive,
  isDisabled,
  onChange,
}) {
  const className = trimList([
    'SelectOption',
    isActive && 'is-active',
    isDisabled && 'is-disabled',
  ])

  const label = getOptionLabel(option)
  const value = getOptionValue(option)

  return (
    <li
      role="option"
      data-value={value}
      className={className}
      onClick={isDisabled ? undefined : onChange}
    >
      <Ellipsis>{ label }</Ellipsis>
    </li>
  )
}

Option.propTypes = {
  idx: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  option: PropTypes.oneOfType([
    PropTypes.node,
    PropTypes.object,
  ]),
  isDisabled: PropTypes.bool,
  onChange: PropTypes.func,
}

export function CoreSelect(props) {
  return <Select {...props} theme="core" />
}

export function PanelSelect({ className, ...others }) {
  return (
    <Input
      size="small"
      className={trimList(['PanelSelect', className])}
      {...others}
    />
  )
}

PanelSelect.propTypes = {
  className: PropTypes.string,
}
